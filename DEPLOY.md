# Deploying to Google Cloud (Compute Engine)

The service runs on a single small VM with Docker Compose:

```text
Internet ──443──▶ Caddy (TLS) ──┬─ WebSocket upgrade ─▶ app:8080 (Chrome extension)
                                └─ everything else ───▶ app:3000 (/webhooks/sns, /health)
                                                         │
                                                  SQLite on volume app-data (/data)
```

Why a VM and not Cloud Run: the app runs cron jobs in-process, keeps long-lived
WebSocket connections and stores data in a SQLite file. Cloud Run scales to zero
(cron would not fire) and has an ephemeral filesystem (the DB would be lost).

Run the `gcloud` commands from [Cloud Shell](https://shell.cloud.google.com) or a
machine with the gcloud CLI installed.

## 1. Create the VM

```bash
PROJECT=your-gcp-project-id
REGION=us-east1
ZONE=us-east1-b

gcloud config set project $PROJECT
gcloud services enable compute.googleapis.com

# Static IP so DNS / SNS / the extension don't break on reboot
gcloud compute addresses create scrappebot-ip --region=$REGION
gcloud compute addresses describe scrappebot-ip --region=$REGION --format='value(address)'

# Allow HTTP (for the Let's Encrypt challenge) and HTTPS
gcloud compute firewall-rules create scrappebot-web \
  --allow=tcp:80,tcp:443 --target-tags=scrappebot

gcloud compute instances create scrappebot \
  --zone=$ZONE \
  --machine-type=e2-small \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=20GB \
  --address=scrappebot-ip \
  --tags=scrappebot
```

## 2. Point a hostname at the IP

Either:
- **Your own subdomain** (recommended): add an `A` record such as
  `bot.artreserve.org → <static IP>`, or
- **No DNS needed**: use `<ip-with-dashes>.sslip.io`, e.g. `34-75-10-20.sslip.io`.

That hostname is `DOMAIN` below.

## 3. Install Docker and get the code

```bash
gcloud compute ssh scrappebot --zone=$ZONE

# on the VM:
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

git clone https://github.com/Builders-Inc/ScrappeBot.git
cd ScrappeBot
```

If the repo is private, `git clone` asks for credentials. Use a GitHub
personal access token, or a deploy key added to the repo.

## 4. Configure

```bash
cp .env.example .env
nano .env
```

| Variable | Value |
|---|---|
| `DOMAIN` | hostname from step 2 |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | keys for an IAM user limited to `ses:SendEmail` and `ses:SendRawEmail`. GCP has no AWS role to fall back on, so these are required |
| `AWS_REGION`, `SES_FROM_EMAIL`, `SES_FROM_NAME` | your SES settings |
| `COOKIE` | ArtStation session cookie |
| `WS_TOKEN` | output of `openssl rand -hex 24` |
| `SNS_TOPIC_ARN` | ARN of the SNS topic SES publishes bounces/complaints to |

```bash
chmod 600 .env
```

## 5. Start

```bash
docker compose up -d --build
docker compose logs -f app      # expect "Webhook server running" + schedule list
curl https://$DOMAIN/health     # {"status":"ok",...}
```

## 6. Wire up the outside pieces

1. **SNS**: in the SNS console, add (or replace) the topic subscription with
   protocol **HTTPS** and endpoint `https://DOMAIN/webhooks/sns`. The app confirms
   it automatically. Check `docker compose logs app` for "SNS subscription confirmed".
2. **Chrome extension**: change its WebSocket URL from `ws://localhost:8080` to
   `wss://DOMAIN/?token=<WS_TOKEN>`.

## 7. Backups

The database lives in the `app-data` Docker volume on the VM's boot disk. Turn on
daily disk snapshots:

```bash
gcloud compute resource-policies create snapshot-schedule scrappebot-daily \
  --region=$REGION --daily-schedule --start-time=02:00 --max-retention-days=14
gcloud compute disks add-resource-policies scrappebot \
  --zone=$ZONE --resource-policies=scrappebot-daily
```

To copy the DB off the VM:

```bash
docker compose cp app:/data/artstation.db ./artstation-backup.db
```

To move an existing local `artstation.db` onto the server, stop the app, copy it in, and start again:

```bash
docker compose stop app
docker compose cp ./artstation.db app:/data/artstation.db
docker compose start app
```

## Updating

```bash
cd ~/ScrappeBot
git pull
docker compose up -d --build
```

Note: the email job has `runOnInit: true`, so every restart sends one batch of
pending emails right away.

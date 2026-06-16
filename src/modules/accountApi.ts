import { Router, Request, Response } from "express";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { senders, Sender } from "../config/senders";

export function parseAccounts(input: string): { email: string; password: string }[] {
    const lines = input.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const accounts = [];
    for (let i = 0; i < lines.length - 1; i += 2) {
        const email = lines[i];
        const password = lines[i + 1];
        if (email && password) accounts.push({ email, password });
    }
    return accounts;
}

export function envKeyForEmail(email: string) {
    return email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "").toUpperCase() + "_PASSWORD";
}

export function nameFromEmail(email: string) {
    const [user] = email.split("@");
    return user.replace(/\d+$/, "").replace(/\./g, " ").replace(/(^|\s)\w/g, c => c.toUpperCase());
}

export async function verifyGmail(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
        const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: { user: email, pass: password },
        });
        await transporter.verify();
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export function updateEnvFile(envPath: string, key: string, value: string) {
    let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(env)) {
        env = env.replace(regex, `${key}=${value}`);
    } else {
        env += `\n${key}=${value}`;
    }
    fs.writeFileSync(envPath, env.trim() + "\n");
}

export function updateSendersTs(sendersPath: string, senders: Array<{ email: string; name: string; envKey: string }>) {
    const senderEntries = senders.map(sender =>
        `  {\n    email: "${sender.email}",\n    name: "${sender.name}",\n    password: process.env.${sender.envKey} || "",\n  }`
    ).join(",\n");

    const content = `// config/senders.ts
        export interface Sender {
            email: string;
            name: string;
            password: string; // Add password field
        }

    export const senders: Sender[] = [
        ${senderEntries}
    ];
    `;

    fs.writeFileSync(sendersPath, content);
}

import path from "path";
import {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";

import {
  parseAccounts,
  envKeyForEmail,
  nameFromEmail,
  verifyGmail,
  updateEnvFile,
  updateSendersTs,
} from "./accountApi";

/**
 * POST /api/add-accounts
 * Body: { accounts: Array<{ email: string, password: string, name?: string }> }
 */
export const addAccountsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const accounts = req.body.accounts;

    if (!Array.isArray(accounts) || !accounts.every(acc => acc && typeof acc.email === 'string' && typeof acc.password === 'string')) {
      return res
        .status(400)
        .json({ error: "Expected JSON body: { accounts: Array<{ email, password, name? }> }" });
    }

    const results: Array<{
      email: string;
      success: boolean;
      error?: string;
    }> = [];

    const successfulSenders: Array<{ email: string; name: string; envKey: string }> = [];

    for (const { email, password, name } of accounts) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        results.push({
          email,
          success: false,
          error: "Invalid email format",
        });
        continue;
      }

      const envKey = envKeyForEmail(email);
      const displayName = name || nameFromEmail(email);
      const verify = await verifyGmail(email, password);

      if (verify.success) {
        try {
          updateEnvFile(
            path.resolve(process.cwd(), ".env"),
            envKey,
            password
          );
          successfulSenders.push({
            email,
            name: displayName,
            envKey
          });
          results.push({ email, success: true });
        } catch (err: any) {
          results.push({
            email,
            success: false,
            error: err.message,
          });
        }
      } else {
        results.push({
          email,
          success: false,
          error: verify.error,
        });
      }
    }

    // Update senders.ts with all successful accounts
    if (successfulSenders.length > 0) {
      updateSendersTs(
        path.resolve(__dirname, "../config/senders.ts"),
        successfulSenders
      );
    }

    res.json({ results });
  } catch (err) {
    /* forward unexpected errors */
    next(err);
  }
};

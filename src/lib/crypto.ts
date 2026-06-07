import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";

const getKey = () =>
  createHash("sha256").update(env.companionSecret, "utf8").digest();

export const encryptSecret = (value: string) => {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedPassword: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
};

export const decryptSecret = (payload: {
  encryptedPassword: string;
  iv: string;
  authTag: string;
}) => {
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(payload.iv, "base64"),
  );

  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.encryptedPassword, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};

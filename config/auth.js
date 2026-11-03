import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { getDB, getMongoClient } from "./mongodb.js";

export function createAuth() {
  return betterAuth({
    database: mongodbAdapter(getDB(), {
      client: getMongoClient(),
    }),

    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
    },

    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
    },

    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
      },
    },

    advanced: {
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: false,
        httpOnly: true,
      },
    },

    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,

    trustedOrigins: [
      "http://localhost:3000",
      "https://studiospace-client-sandy.vercel.app",
    ],
  });
}
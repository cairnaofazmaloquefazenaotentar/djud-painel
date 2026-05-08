import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "./db";

const allowedDomains = (process.env.AUTH_ALLOWED_DOMAINS || "")
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean);

const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID || "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET || "",
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      if (allowedDomains.length > 0) {
        const domain = user.email.split("@")[1];
        if (!allowedDomains.includes(domain)) {
          return false;
        }
      }

      return true;
    },
    async session({ session, token }: any) {
      if (session.user && token) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) || "OPERATOR";
        session.user.organizacaoId = token.organizacaoId ?? null;
        session.user.organizacaoName = token.organizacaoName ?? null;
      }
      return session;
    },
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;

        // Buscar role e organização do banco de dados
        const dbUser = await db.user.findUnique({
          where: { id: user.id },
          select: {
            role: true,
            organizationId: true,
            organization: { select: { name: true } },
          },
        });

        token.role = dbUser?.role || "OPERATOR";
        token.organizacaoId = dbUser?.organizationId ?? null;
        token.organizacaoName = dbUser?.organization?.name ?? null;
      }
      return token;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  trustHost: true,
} as NextAuthConfig & { skipCSRFCheck?: boolean };

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

import { AppDataSource } from "@/config/data-source";
import { TypeAccount, User } from "@/entities/admin/User";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library"; // npm i google-auth-library

const userRepo = AppDataSource.getRepository(User);

// Cliente para verificar tokens de Flutter (Android/iOS)
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const GoogleAuthService = {
    /**
     * Verifica el idToken que envía la app Flutter y devuelve el payload.
     * Lanza error si el token es inválido o no corresponde a tu app.
     */
    async verifyMobileIdToken(idToken: string) {
        const ticket = await googleClient.verifyIdToken({
            idToken,
            // Acepta tanto el client ID web como el de Android/iOS
            audience: [
                process.env.GOOGLE_CLIENT_ID!, // si tienes
                process.env.GOOGLE_IOS_CLIENT_ID!,     // si tienes
            ].filter(Boolean),
        });

        const payload = ticket.getPayload();
        if (!payload) throw new Error("Token de Google inválido");

        return payload; // { sub, email, name, picture, email_verified, ... }
    },

    /**
     * Busca o crea un usuario a partir del payload verificado de Google.
     * Mismo comportamiento que el flujo web pero sin depender de Passport.
     */
    async findOrCreateFromPayload(payload: any) {
        const { sub: googleId, email, name: displayName, picture } = payload;

        if (!email) throw new Error("No se pudo obtener el email de Google");

        let user = await userRepo.findOne({
            where: [{ googleId }, { email }],
            select: [
                "id", "email", "phone", "fullName", "userAccount",
                "emailVerified", "twoFactorEnabled", "googleId",
                "googleProfileIncomplete", "profilePicture", "createdAt",
            ],
        });

        if (user) {
            let needsUpdate = false;

            if (!user.googleId) { user.googleId = googleId; needsUpdate = true; }
            if (!user.emailVerified) { user.emailVerified = true; needsUpdate = true; }
            if (picture && !user.profilePicture) { user.profilePicture = picture; needsUpdate = true; }

            if (needsUpdate) await userRepo.save(user);
            return user;
        }

        // Usuario nuevo → perfil incompleto (falta teléfono)
        const newUser = userRepo.create({
            email,
            googleId,
            fullName: displayName || email,
            phone: null,
            password: crypto.randomBytes(32).toString("hex"),
            userAccount: TypeAccount.FREE,
            emailVerified: true,
            googleProfileIncomplete: true,
            profilePicture: picture ?? null,
            twoFactorEnabled: false,
        });

        return await userRepo.save(newUser);
    },

    // ── Flujo web con Passport (se mantiene para la página React) ──────────

    /** Busca o crea usuario desde el perfil de Passport (flujo web) */
    async findOrCreateGoogleUser(profile: any) {
        const { id: googleId, emails, displayName, photos } = profile;

        if (!emails || emails.length === 0)
            throw new Error("No se pudo obtener el email de Google");

        const email = emails[0].value;
        const profilePicture = photos?.[0]?.value ?? null;

        let user = await userRepo.findOne({
            where: [{ googleId }, { email }],
            select: [
                "id", "email", "phone", "fullName", "userAccount",
                "emailVerified", "twoFactorEnabled", "googleId",
                "googleProfileIncomplete", "profilePicture", "createdAt",
            ],
        });

        if (user) {
            let needsUpdate = false;
            if (!user.googleId) { user.googleId = googleId; needsUpdate = true; }
            if (!user.emailVerified) { user.emailVerified = true; needsUpdate = true; }
            if (profilePicture && !user.profilePicture) { user.profilePicture = profilePicture; needsUpdate = true; }
            if (needsUpdate) await userRepo.save(user);
            return user;
        }

        const newUser = userRepo.create({
            email,
            googleId,
            fullName: displayName || email,
            phone: null,
            password: crypto.randomBytes(32).toString("hex"),
            userAccount: TypeAccount.FREE,
            emailVerified: true,
            googleProfileIncomplete: true,
            profilePicture,
            twoFactorEnabled: false,
        });

        return await userRepo.save(newUser);
    },

    /** Genera JWT normal (1 día) */
    generateToken(user: User) {
        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET || "default_secret",
            { expiresIn: "1d" },
        );

        return {
            user: {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                phone: user.phone,
                userAccount: user.userAccount,
                emailVerified: user.emailVerified,
                twoFactorEnabled: user.twoFactorEnabled || false,
                profilePicture: user.profilePicture,
                createdAt: user.createdAt,
                googleProfileIncomplete: user.googleProfileIncomplete,
            },
            token,
        };
    },
};
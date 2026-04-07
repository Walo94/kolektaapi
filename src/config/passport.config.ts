import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { GoogleAuthService } from "@/services/admin/GoogleAuthService";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL;

// Solo configurar Google OAuth si todas las credenciales están disponibles
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_CALLBACK_URL) {
    passport.use(
        new GoogleStrategy(
            {
                clientID: GOOGLE_CLIENT_ID,
                clientSecret: GOOGLE_CLIENT_SECRET,
                callbackURL: GOOGLE_CALLBACK_URL,
                scope: ["profile", "email"],
            },
            async (accessToken, refreshToken, profile, done) => {
                try {
                    const user = await GoogleAuthService.findOrCreateGoogleUser(profile);
                    return done(null, user);
                } catch (error) {
                    return done(error as Error, undefined);
                }
            },
        ),
    );
} else {
    console.warn(
        "Google OAuth not configured. Missing environment variables:",
        {
            hasClientID: !!GOOGLE_CLIENT_ID,
            hasClientSecret: !!GOOGLE_CLIENT_SECRET,
            hasCallbackURL: !!GOOGLE_CALLBACK_URL,
        },
    );
}

passport.serializeUser((user: any, done) => {
    done(null, user.id);
});

passport.deserializeUser((id: string, done) => {
    done(null, { id });
});

export default passport;
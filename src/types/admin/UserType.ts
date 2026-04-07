export type UserSave = {
    fullName: string;
    email: string;
    username: string;
    password: string;
    userAccount: string;
    phone?: string;
    emailVerified: boolean;
    emailVerificationToken: string;
    emailVerificationExpires: Date;
}
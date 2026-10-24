# Mirror

Mirror is a Next.js app for private, voluntary life-alignment and time reflection. Authentication uses Supabase Auth (Google OAuth or phone SMS OTP), and per-user database access is enforced by the RLS policies in `supabase/schema.sql`.

## Getting Started

### Supabase authentication

1. Create a Supabase project.
2. In **Project Settings → API**, copy the Project URL and publishable key (`sb_publishable_...`) into `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Never use a service-role key in the app.
3. In the Supabase **SQL Editor**, run `supabase/schema.sql` once to create the existing tables, profile trigger, and RLS policies.
4. In **Authentication → URL Configuration**, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback**` to the allowed redirect URLs. The wildcard permits the app's safe `next` query parameter. Add the equivalent callback pattern for each deployed app domain.
5. In **Authentication → Providers → Phone**, enable phone sign-in and configure an SMS provider and its credentials. Supabase sends and verifies the OTP; there is no development verification-code bypass.

### Google sign-in

1. In Google Cloud Console, configure the OAuth consent screen and create an OAuth client with **Web application** as its type.
2. Add `http://localhost:3000` and any deployed app origins as authorized JavaScript origins.
3. In Supabase **Authentication → Providers → Google**, paste the client ID and client secret from Google Cloud and enable the provider.
4. Copy the Supabase callback URL shown in that Google provider's settings (it ends with `/auth/v1/callback`) into the Google OAuth client's **Authorized redirect URIs**. This Google-to-Supabase callback is different from the app callback URL configured in Supabase's URL Configuration.
5. If Google's consent screen is in testing mode, add the accounts you will use as test users.

Set `NEXT_PUBLIC_APP_URL` to the app's public origin when deploying. The OAuth callback itself is generated from the current request origin.

Run the app with `npm run dev`.

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

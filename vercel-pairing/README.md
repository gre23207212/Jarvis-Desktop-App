# Jarvis Desktop phone site on Vercel

This folder is a small Vercel forwarding site. It serves only `/pairing`, its required assets and connection requests. `/` redirects to `/pairing`; desktop chat, Mainframe and mate pages are not forwarded. The existing published Jarvis app continues to run the private pairing and remote command services. No secrets belong in Vercel for this setup.

1. Publish the latest Jarvis app so `/pairing` exists at the hosted origin.
2. Connect this repository to Vercel and create a project.
3. Set **Root Directory** to `vercel-pairing`.
4. Choose **Other** as the framework, leave the build command empty, set **Output Directory** to `public`, and leave the install command empty (no dependencies are needed).
5. Choose project name `jarvis-desktop` if Vercel says it is available; otherwise choose another name.
6. Deploy and open `https://YOUR-PROJECT.vercel.app/pairing`. Generate a code on your PC in Mainframe → Skills → Pair phone and enter it here.

The Vercel address remains in the phone browser. Its connection is stored separately from the original hosted address, so pair again if changing between them. Keep the published Jarvis origin online and republish it for future app updates. Do not import the repository root as a Vercel app: that would attempt to deploy the complete desktop/web project rather than this phone-only forwarding site.

The local `/pairing` flow can be tested before deployment. Actual Vercel rewrite behavior, speech recording, and availability of the requested project name must be verified after deployment in your Vercel account. No Vercel deployment has been created automatically.
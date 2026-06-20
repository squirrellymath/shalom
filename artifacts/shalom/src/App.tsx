import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import MemberHome from "@/pages/member-home";

const queryClient = new QueryClient();

// ─── Access gate ────────────────────────────────────────────────────────────
// Edit this list to grant early access. Comparison is case-insensitive.
// Users whose role === "admin" always bypass regardless of email.
const SHALOM_BYPASS = [
  "justin.malkin@outlook.com",
  "rechavambenshlomo@outlook.com",
  "rechavambenshlomo@gmail.com",
];

const SSO_INIT_URL =
  "https://bridget.fyi/auth/sso/init?return_to=" +
  encodeURIComponent("https://shalom.fyi/auth/sso/callback");

function canAccess(email?: string, role?: string): boolean {
  if (role === "admin") return true;
  if (!email) return false;
  return SHALOM_BYPASS.includes(email.trim().toLowerCase());
}
// ────────────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="w-full flex flex-col items-center justify-center gap-6 pb-6 mt-auto">
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs sm:text-sm font-sans tracking-wide text-primary/50 uppercase">
        <a href="https://bloodlessrevolution.com" className="hover:text-primary transition-colors duration-300">bloodlessrevolution.com</a>
        <span className="opacity-30">|</span>
        <a href="https://bridget.fyi" className="hover:text-primary transition-colors duration-300">bridget.fyi</a>
        <span className="opacity-30">|</span>
        <a href="https://verdicts.ai" className="hover:text-primary transition-colors duration-300">verdicts.ai</a>
      </div>
      <p className="text-xs font-sans text-primary/30">
        © 2026 Bloodless Revolution LLC
      </p>
    </footer>
  );
}

// State 1: logged-out public landing page
function Home() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 selection:bg-primary/30">
      <div className="w-full max-w-xl mx-auto flex flex-col items-center text-center mt-12 sm:mt-24 mb-16 sm:mb-32 flex-1 justify-center">

        <h1 className="font-serif text-5xl sm:text-7xl tracking-wide font-medium text-primary mb-6 drop-shadow-sm">
          ש Shalom
        </h1>

        <p className="font-serif text-xl sm:text-2xl italic text-primary/90 mb-12 sm:mb-16 leading-relaxed max-w-md">
          A space for conversations that matter. Facilitated by Bridget. Permanent by design.
        </p>

        <p className="font-sans text-base sm:text-lg text-primary/80 leading-loose mb-16 sm:mb-24 max-w-lg font-light">
          Some conversations deserve a witness. Shalom is a private space where two people can talk — mediated by Bridget, timestamped, and permanently recorded. Nothing altered. Nothing lost. A record that belongs to both of you, forever.
        </p>

        <div className="w-full max-w-sm mb-16 flex flex-col items-center gap-6">
          <a
            href={SSO_INIT_URL}
            className="inline-flex items-center justify-center px-8 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-sans uppercase tracking-wider text-xs transition-all duration-300 rounded-none shadow-none hover:shadow-[0_0_15px_rgba(217,184,127,0.15)]"
          >
            Sign in with Bridget
          </a>
          <p className="text-xs text-primary/50 font-sans">
            For inquiries or early access:{" "}
            <a
              href="mailto:shalom@bloodlessrevolution.com"
              className="text-primary/70 hover:text-primary underline underline-offset-2 transition-colors duration-300"
            >
              shalom@bloodlessrevolution.com
            </a>
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}

// State 3: logged-in but not on bypass list
function ComingSoon({ email }: { email?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 selection:bg-primary/30">
      <div className="w-full max-w-xl mx-auto flex flex-col items-center text-center mt-12 sm:mt-24 mb-16 sm:mb-32 flex-1 justify-center">

        <h1 className="font-serif text-5xl sm:text-7xl tracking-wide font-medium text-primary mb-6 drop-shadow-sm">
          ש Shalom
        </h1>

        <p className="font-serif text-xl sm:text-2xl italic text-primary/90 mb-12 sm:mb-16 leading-relaxed max-w-md">
          We're rebuilding Shalom from the ground up.
        </p>

        <p className="font-sans text-base sm:text-lg text-primary/80 leading-loose mb-16 sm:mb-24 max-w-lg font-light">
          Something better is on its way. Check back soon.
        </p>

        <div className="w-full max-w-sm mb-16 flex flex-col items-center gap-5">
          <p className="text-xs text-primary/50 font-sans">
            For inquiries or early access:{" "}
            <a
              href="mailto:shalom@bloodlessrevolution.com"
              className="text-primary/70 hover:text-primary underline underline-offset-2 transition-colors duration-300"
            >
              shalom@bloodlessrevolution.com
            </a>
          </p>
          {email && (
            <p className="text-xs text-primary/40 font-sans">
              Signed in as <span className="text-primary/60">{email}</span>
              {" · "}
              <a
                href="/auth/logout"
                className="hover:text-primary/70 underline underline-offset-2 transition-colors duration-300"
              >
                Sign out
              </a>
            </p>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}

function Router() {
  const [auth, setAuth] = useState<{
    authenticated: boolean;
    email?: string;
    role?: string;
  } | null>(null);

  useEffect(() => {
    fetch("/member/status", { credentials: "include" })
      .then((r) => r.json())
      .then(setAuth)
      .catch(() => setAuth({ authenticated: false }));
  }, []);

  if (!auth) return null;

  return (
    <Switch>
      <Route path="/">
        {!auth.authenticated ? (
          <Home />
        ) : canAccess(auth.email, auth.role) ? (
          <MemberHome email={auth.email} />
        ) : (
          <ComingSoon email={auth.email} />
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

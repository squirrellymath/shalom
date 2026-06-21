import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import MemberHome from "@/pages/member-home";

const queryClient = new QueryClient();

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

        <div className="w-full max-w-sm mb-16 flex flex-col items-center">
          <p className="text-xs text-primary/50 font-sans">
            For inquiries:{" "}
            <a
              href="mailto:shalom@bloodlessrevolution.com"
              className="text-primary/70 hover:text-primary underline underline-offset-2 transition-colors duration-300"
            >
              shalom@bloodlessrevolution.com
            </a>
          </p>
        </div>
      </div>

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
    </div>
  );
}

function Router() {
  const [auth, setAuth] = useState<{ authenticated: boolean; email?: string } | null>(null);

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
        {auth.authenticated ? <MemberHome email={auth.email} /> : <Home />}
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

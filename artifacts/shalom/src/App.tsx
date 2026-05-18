import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const queryClient = new QueryClient();

function Home() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubmitted(true);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 selection:bg-primary/30">
      <div className="w-full max-w-xl mx-auto flex flex-col items-center text-center mt-12 sm:mt-24 mb-16 sm:mb-32 flex-1 justify-center">
        
        <h1 className="font-serif text-5xl sm:text-7xl tracking-wide font-medium text-primary mb-6 drop-shadow-sm">
          ש&nbsp;Shalom
        </h1>
        
        <p className="font-serif text-xl sm:text-2xl italic text-primary/90 mb-12 sm:mb-16 leading-relaxed max-w-md">
          A space for conversations that matter. Facilitated by Bridget. Permanent by design.
        </p>

        <p className="font-sans text-base sm:text-lg text-primary/80 leading-loose mb-12 sm:mb-16 max-w-lg font-light">
          Some conversations deserve a witness. Shalom is a private space where two people can talk — mediated by Bridget, timestamped, and permanently recorded. Nothing altered. Nothing lost. A record that belongs to both of you, forever.
        </p>

        <a
          href="https://bridget.fyi/auth/sso/init?return_to=https://shalom.fyi/auth/sso/callback"
          data-testid="link-sign-in"
          className="font-serif italic text-base sm:text-lg text-primary/70 hover:text-primary transition-colors duration-300 mb-12 sm:mb-16 tracking-wide"
        >
          Sign in with Bridget →
        </a>

        <div className="w-full max-w-sm mb-16">
          {!submitted ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-6 animate-in fade-in zoom-in duration-500">
              <label htmlFor="email-input" className="text-xs sm:text-sm uppercase tracking-widest font-medium text-primary/70">
                Enter your email to be notified when Shalom opens.
              </label>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-3 w-full">
                <Input 
                  id="email-input"
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  data-testid="input-email"
                  className="bg-transparent border-primary/20 text-primary placeholder:text-primary/30 h-12 px-4 rounded-none focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:border-primary/50 transition-all duration-300 font-sans text-sm text-center sm:text-left"
                  required
                />
                <Button 
                  type="submit" 
                  data-testid="button-submit"
                  className="h-12 px-8 bg-primary text-primary-foreground hover:bg-primary/90 rounded-none font-sans uppercase tracking-wider text-xs transition-all duration-300 shadow-none hover:shadow-[0_0_15px_rgba(217,184,127,0.15)]"
                >
                  Submit
                </Button>
              </div>
            </form>
          ) : (
            <div 
              data-testid="text-confirmation"
              className="h-28 flex items-center justify-center animate-in fade-in slide-in-from-bottom-2 duration-700"
            >
              <p className="font-serif text-2xl italic text-primary">You're on the list.</p>
            </div>
          )}
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
  return (
    <Switch>
      <Route path="/" component={Home} />
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

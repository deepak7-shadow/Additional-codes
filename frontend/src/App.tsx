import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AdminPage, ArenaDetailPage, BookingPage, DashboardLandingPage, DiscoverPage, DocumentsPage, Home, HowItWorksPage, JoinArenaHubPage, OwnerArenaRecordPage, OwnerPortalPage, PlayerDashboardPage } from "./pages/ArenaHubPages";
import { OwnerVenueRevision } from "./components/OwnerVenueRevision";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/join"} component={JoinArenaHubPage} />
      <Route path={"/discover"} component={DiscoverPage} />
      <Route path={"/arena/:id"} component={ArenaDetailPage} />
      <Route path={"/booking"} component={BookingPage} />
      <Route path={"/owner-record"} component={OwnerArenaRecordPage} />
      <Route path={"/owner/edit"} component={OwnerVenueRevision} />
      <Route path={"/owner/dashboard"} component={OwnerPortalPage} />
      <Route path={"/owner"} component={OwnerPortalPage} />
      <Route path={"/player/dashboard"} component={PlayerDashboardPage} />
      <Route path={"/dashboard"} component={DashboardLandingPage} />
      <Route path={"/admin/dashboard"} component={AdminPage} />
      <Route path={"/admin"} component={AdminPage} />
      <Route path={"/documents"} component={DocumentsPage} />
      <Route path={"/how-it-works"} component={HowItWorksPage} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

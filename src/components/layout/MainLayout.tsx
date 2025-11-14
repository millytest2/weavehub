import { Brain, Home, Lightbulb, FileText, Map, ListTodo, LogOut, FlaskConical } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";

export const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const { signOut } = useAuth();

  const navigation = [
    { name: "Dashboard", href: "/", icon: Home },
    { name: "Insights", href: "/insights", icon: Lightbulb },
    { name: "Documents", href: "/documents", icon: FileText },
    { name: "Topics", href: "/paths", icon: Map },
    { name: "Experiments", href: "/experiments", icon: FlaskConical },
    { name: "Daily", href: "/daily", icon: ListTodo },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Minimal Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">Knowledge Hub</h1>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
                activeClassName="bg-primary/10 text-primary hover:bg-primary/10"
              >
                <item.icon className="h-4 w-4" />
                <span className="hidden md:inline">{item.name}</span>
              </NavLink>
            ))}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="ml-2 gap-2 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden md:inline">Sign Out</span>
            </Button>
          </nav>
        </div>
      </div>

      {/* Main Content with top padding */}
      <main className="flex-1 pt-16">
        <div className="mx-auto max-w-7xl p-6 md:p-8">{children}</div>
      </main>
    </div>
  );
};

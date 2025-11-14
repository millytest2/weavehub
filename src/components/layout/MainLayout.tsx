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
    { name: "Learning Paths", href: "/paths", icon: Map },
    { name: "Experiments", href: "/experiments", icon: FlaskConical },
    { name: "Daily Focus", href: "/daily", icon: ListTodo },
  ];

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-background via-background to-secondary">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card p-6">
        <div className="mb-8 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Brain className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Knowledge Hub</h1>
            <p className="text-xs text-muted-foreground">Your learning companion</p>
          </div>
        </div>

        <nav className="space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
              activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-6">
          <Button
            variant="ghost"
            onClick={signOut}
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-5 w-5" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl p-8">{children}</div>
      </main>
    </div>
  );
};

import { Brain, Home, Lightbulb, FileText, Map, ListTodo, LogOut, FlaskConical, Compass, Menu, X } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const navigation = [
    { name: "Dashboard", href: "/", icon: Home },
    { name: "Daily", href: "/daily", icon: ListTodo },
    { name: "Identity", href: "/identity", icon: Compass },
    { name: "Insights", href: "/insights", icon: Lightbulb },
    { name: "Documents", href: "/documents", icon: FileText },
    { name: "Paths", href: "/paths", icon: Map },
    { name: "Experiments", href: "/experiments", icon: FlaskConical },
  ];

  // Primary tabs for bottom nav (most used)
  const primaryNav = navigation.slice(0, 4);
  const secondaryNav = navigation.slice(4);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
              <Brain className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold hidden sm:inline">Knowledge Hub</span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === "/"}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:text-foreground hover:bg-accent/10"
                activeClassName="bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground"
              >
                <item.icon className="h-4 w-4" />
                <span>{item.name}</span>
              </NavLink>
            ))}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="ml-2 gap-2 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </Button>
          </nav>

          {/* Mobile Menu Button */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 p-0">
              <div className="flex flex-col h-full">
                <div className="p-4 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
                      <Brain className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <span className="text-sm font-semibold">Knowledge Hub</span>
                  </div>
                </div>
                <nav className="flex-1 p-2">
                  {navigation.map((item) => (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      end={item.href === "/"}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-muted-foreground transition-all hover:text-foreground hover:bg-accent/10"
                      activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.name}</span>
                    </NavLink>
                  ))}
                </nav>
                <div className="p-4 border-t border-border/40">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { signOut(); setOpen(false); }}
                    className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
                  >
                    <LogOut className="h-5 w-5" />
                    <span>Sign Out</span>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-background/95 backdrop-blur-xl safe-area-bottom">
        <nav className="flex items-center justify-around h-16 px-2">
          {primaryNav.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === "/"}
              className="flex flex-col items-center gap-1 py-2 px-3 text-muted-foreground transition-all"
              activeClassName="text-primary"
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.name}</span>
            </NavLink>
          ))}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button className="flex flex-col items-center gap-1 py-2 px-3 text-muted-foreground">
                <Menu className="h-5 w-5" />
                <span className="text-[10px] font-medium">More</span>
              </button>
            </SheetTrigger>
          </Sheet>
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 pt-14 pb-20 md:pb-0">
        <div className="mx-auto max-w-7xl p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
};

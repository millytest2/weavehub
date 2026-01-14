import { Brain, Home, Lightbulb, FileText, ListTodo, FlaskConical, Compass, Menu, User } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ProfileSheet } from "@/components/ProfileSheet";
import { QuickCapture } from "@/components/dashboard/QuickCapture";
import { DecisionMirror } from "@/components/dashboard/DecisionMirror";

export const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();

  const navigation = [
    { name: "Dashboard", href: "/", icon: Home },
    { name: "Daily", href: "/daily", icon: ListTodo },
    { name: "Identity", href: "/identity", icon: Compass },
    { name: "Insights", href: "/insights", icon: Lightbulb },
    { name: "Documents", href: "/documents", icon: FileText },
    { name: "Experiments", href: "/experiments", icon: FlaskConical },
    { name: "Paths", href: "/learning-paths", icon: Brain },
  ];

  const primaryNav = navigation.slice(0, 4);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Top Bar - Refined */}
      <div className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 glass">
        <div className="flex h-14 items-center justify-between px-4 max-w-7xl mx-auto">
          {/* Logo */}
          <button 
            onClick={() => navigate("/")} 
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary shadow-soft">
              <Brain className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-base font-semibold hidden sm:inline font-display">Weave</span>
          </button>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === "/"}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-all hover:text-foreground hover:bg-muted/50"
                activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground shadow-soft"
              >
                <item.icon className="h-4 w-4" />
                <span className="hidden lg:inline font-medium">{item.name}</span>
              </NavLink>
            ))}
            
            <div className="w-px h-6 bg-border/50 mx-2" />
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setProfileOpen(true)}
              className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground"
            >
              <User className="h-4 w-4" />
            </Button>
          </nav>

          {/* Mobile Menu */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 p-0 border-l border-border/40">
              <div className="flex flex-col h-full">
                <div className="p-5 border-b border-border/40">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary shadow-soft">
                      <Brain className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <span className="text-base font-semibold font-display">Weave</span>
                  </div>
                </div>
                <nav className="flex-1 p-3 space-y-1">
                  {navigation.map((item) => (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      end={item.href === "/"}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-muted-foreground transition-all hover:text-foreground hover:bg-muted/50"
                      activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="font-medium">{item.name}</span>
                    </NavLink>
                  ))}
                </nav>
                <div className="p-4 border-t border-border/40">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setMenuOpen(false); setProfileOpen(true); }}
                    className="w-full justify-start gap-3 rounded-xl text-muted-foreground hover:text-foreground"
                  >
                    <User className="h-4 w-4" />
                    <span className="font-medium">Profile</span>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Mobile Bottom Nav - Sleek */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 glass safe-area-bottom">
        <nav className="flex items-center justify-around h-16 px-2 max-w-lg mx-auto">
          {primaryNav.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === "/"}
              className="flex flex-col items-center gap-1 py-2 px-4 text-muted-foreground transition-all rounded-xl"
              activeClassName="text-primary"
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.name}</span>
            </NavLink>
          ))}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button className="flex flex-col items-center gap-1 py-2 px-4 text-muted-foreground rounded-xl">
                <Menu className="h-5 w-5" />
                <span className="text-[10px] font-medium">More</span>
              </button>
            </SheetTrigger>
          </Sheet>
        </nav>
      </div>

      {/* Profile Sheet */}
      <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />

      {/* Global Quick Capture FAB */}
      <QuickCapture />
      <DecisionMirror />

      {/* Main Content */}
      <main className="flex-1 pt-14 pb-20 md:pb-6">
        <div className="mx-auto max-w-7xl p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
};
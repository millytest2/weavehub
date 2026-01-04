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
    { name: "Life Tests", href: "/experiments", icon: FlaskConical },
    { name: "Paths", href: "/learning-paths", icon: Brain },
  ];

  const primaryNav = navigation.slice(0, 4);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-xl">
        <div className="flex h-12 items-center justify-between px-4">
          {/* Logo - Clickable */}
          <button 
            onClick={() => navigate("/")} 
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Brain className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold hidden sm:inline">Weave</span>
          </button>

          {/* Desktop/Tablet Nav - Icon only on tablet, icon+text on desktop */}
          <nav className="hidden md:flex items-center gap-0.5">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === "/"}
                className="flex items-center gap-1.5 rounded-md px-2 lg:px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/50"
                activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
              >
                <item.icon className="h-4 w-4" />
                <span className="hidden lg:inline text-xs font-medium">{item.name}</span>
              </NavLink>
            ))}
            
            <div className="w-px h-5 bg-border/50 mx-2" />
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setProfileOpen(true)}
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
            >
              <User className="h-4 w-4" />
            </Button>
          </nav>

          {/* Mobile Menu */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-56 p-0">
              <div className="flex flex-col h-full">
                <div className="p-4 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
                      <Brain className="h-3.5 w-3.5 text-primary-foreground" />
                    </div>
                    <span className="text-sm font-semibold">Weave</span>
                  </div>
                </div>
                <nav className="flex-1 p-2">
                  {navigation.map((item) => (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      end={item.href === "/"}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/50"
                      activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.name}</span>
                    </NavLink>
                  ))}
                </nav>
                <div className="p-3 border-t border-border/30">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setMenuOpen(false); setProfileOpen(true); }}
                    className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
                  >
                    <User className="h-4 w-4" />
                    <span>Profile</span>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/30 bg-background/80 backdrop-blur-xl safe-area-bottom">
        <nav className="flex items-center justify-around h-14 px-2">
          {primaryNav.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === "/"}
              className="flex flex-col items-center gap-0.5 py-1.5 px-3 text-muted-foreground transition-colors"
              activeClassName="text-primary"
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.name}</span>
            </NavLink>
          ))}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button className="flex flex-col items-center gap-0.5 py-1.5 px-3 text-muted-foreground">
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
      <main className="flex-1 pt-12 pb-16 md:pb-0">
        <div className="mx-auto max-w-7xl p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
};
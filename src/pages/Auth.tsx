import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Brain, Eye, EyeOff, ArrowRight, Sparkles, Check, User, Target, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Core values users can pick from
const CORE_VALUES = [
  "Growth", "Presence", "Focus", "Creation", "Connection",
  "Depth", "Action", "Freedom", "Clarity", "Courage",
  "Discipline", "Play", "Authenticity", "Impact"
] as const;

// Quick identity starters - rotated for split testing
const IDENTITY_STARTERS_POOL = [
  // Core Weave philosophy
  "closes the gap between saving and becoming",
  "turns consumption into action",
  "stops saving, starts becoming",
  "makes every saved thing count",
  
  // Action-oriented
  "ships weekly, not someday",
  "does the thing before feeling ready",
  "takes imperfect action daily",
  "moves before the motivation arrives",
  
  // Anti-distraction
  "chooses depth over distraction",
  "protects their attention like treasure",
  "moves before screens capture them",
  
  // Creative/Building
  "creates more than consumes",
  "builds in public without permission",
  "treats life as one long experiment",
  
  // Unconventional/Bold
  "trusts their gut over the algorithm",
  "makes decisions in 5 minutes, not 5 months",
  "burns the backup plan",
  "says no to good so they can say yes to great",
];

// Get 5 random starters, weighted toward different categories
const getRotatedStarters = (): string[] => {
  const shuffled = [...IDENTITY_STARTERS_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 5);
};

// Compelling "Today's Invitation" samples based on values
const SAMPLE_INVITATIONS = [
  {
    action: "Write down the ONE decision you've been avoiding. Then make it. Right now. In the next 5 minutes.",
    insight: "You already know the answer. You've known for weeks. The discomfort of deciding is less than the weight of carrying it.",
    source: "Action"
  },
  {
    action: "Close every tab. Put your phone in another room. Set a 25-minute timer. Do the thing that matters most.",
    insight: "Distraction isn't the enemy—scattered attention is. One hour of focus creates more than a day of half-presence.",
    source: "Focus"
  },
  {
    action: "Text someone you've been thinking about. Don't overthink it. Just say 'Hey, been thinking about you.'",
    insight: "The relationships that matter most are often one message away from deepening. Send it before the feeling fades.",
    source: "Connection"
  },
  {
    action: "Name your fear out loud. Then do 1% of the thing you're afraid of. Just 1%.",
    insight: "Courage isn't the absence of fear—it's action despite it. The smallest step breaks the spell.",
    source: "Courage"
  },
  {
    action: "Ship something today. Doesn't matter if it's perfect. Hit publish, send, or share.",
    insight: "The gap between who you are and who you want to be closes with every rep. Perfect is the enemy of progress.",
    source: "Creation"
  }
];

type FlowStep = "identity" | "values" | "preview" | "auth";

const Auth = () => {
  const navigate = useNavigate();
  
  // Always start with onboarding for fresh experience
  // Returning users can tap "Already have an account?" to skip
  
  // Flow state - always start with identity for new experience
  const [flowStep, setFlowStep] = useState<FlowStep>("identity");
  const [identitySeed, setIdentitySeed] = useState("");
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [customValue, setCustomValue] = useState("");
  
  // Rotated starters for split testing (memoized per session)
  const [displayedStarters] = useState(() => getRotatedStarters());
  const [starterClicks, setStarterClicks] = useState<Record<string, number>>({});
  
  // Auth state
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check for password recovery
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get("type");
    
    if (type === "recovery") {
      setIsResettingPassword(true);
      setFlowStep("auth");
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsResettingPassword(true);
        setFlowStep("auth");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const toggleValue = (value: string) => {
    setSelectedValues(prev => {
      if (prev.includes(value)) {
        return prev.filter(v => v !== value);
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), value];
      }
      return [...prev, value];
    });
  };

  const addCustomValue = () => {
    const trimmed = customValue.trim();
    if (trimmed && !selectedValues.includes(trimmed) && selectedValues.length < 3) {
      setSelectedValues(prev => [...prev, trimmed]);
      setCustomValue("");
    } else if (selectedValues.length >= 3) {
      // Replace oldest with custom
      setSelectedValues(prev => [...prev.slice(1), trimmed]);
      setCustomValue("");
    }
  };

  const getPersonalizedInvitation = () => {
    // Match based on selected values
    if (selectedValues.includes("Action") || selectedValues.includes("Discipline")) {
      return SAMPLE_INVITATIONS[0];
    }
    if (selectedValues.includes("Focus") || selectedValues.includes("Depth") || selectedValues.includes("Clarity")) {
      return SAMPLE_INVITATIONS[1];
    }
    if (selectedValues.includes("Connection") || selectedValues.includes("Authenticity") || selectedValues.includes("Presence")) {
      return SAMPLE_INVITATIONS[2];
    }
    if (selectedValues.includes("Courage") || selectedValues.includes("Freedom")) {
      return SAMPLE_INVITATIONS[3];
    }
    if (selectedValues.includes("Creation") || selectedValues.includes("Growth") || selectedValues.includes("Impact")) {
      return SAMPLE_INVITATIONS[4];
    }
    // Default to first one
    return SAMPLE_INVITATIONS[0];
  };

  const proceedToAuth = () => {
    setIsLogin(false); // Default to signup after onboarding
    setFlowStep("auth");
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isResettingPassword) {
        if (password !== confirmPassword) {
          toast.error("Passwords do not match");
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast.success("Password updated successfully!");
        setIsResettingPassword(false);
        navigate("/");
      } else if (isForgotPassword) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        toast.success("Password reset email sent! Check your inbox.");
        setIsForgotPassword(false);
      } else if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate("/");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        
        // Save identity from onboarding flow
        if (data.user && (identitySeed || selectedValues.length > 0)) {
          try {
            // Check which starter was used (if any) for split test analytics
            const usedStarter = IDENTITY_STARTERS_POOL.find(starter => 
              identitySeed.includes(starter)
            );
            
            await supabase.from("identity_seeds").insert({
              user_id: data.user.id,
              content: identitySeed || "Someone who takes action daily.",
              core_values: selectedValues.join(", ") || null,
            });
            
            // Log starter conversion for split testing
            if (usedStarter) {
              console.log('[Split Test] Converted with starter:', usedStarter);
            }
          } catch (e) {
            console.error("Failed to save identity:", e);
          }
        }
        
        toast.success("Account created! Welcome to Weave.");
        navigate("/");
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    if (isResettingPassword) return "Set New Password";
    if (isForgotPassword) return "Reset Password";
    return isLogin ? "Welcome Back" : "Create Account";
  };

  const getDescription = () => {
    if (isResettingPassword) return "Enter your new password below";
    if (isForgotPassword) return "Enter your email to receive a reset link";
    return isLogin ? "Sign in to access Weave" : "Save your identity and start weaving";
  };

  const getButtonText = () => {
    if (loading) return "Loading...";
    if (isResettingPassword) return "Update Password";
    if (isForgotPassword) return "Send Reset Link";
    return isLogin ? "Sign In" : "Create Account";
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-secondary p-4">
      <AnimatePresence mode="wait">
        {/* STEP 1: Identity */}
        {flowStep === "identity" && (
          <motion.div
            key="identity"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md"
          >
            <Card className="shadow-lg">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-2xl font-bold">Who are you becoming?</CardTitle>
                <CardDescription>One sentence sharpens everything.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={identitySeed}
                  onChange={(e) => setIdentitySeed(e.target.value)}
                  placeholder="I'm becoming someone who..."
                  className="min-h-[100px] text-base resize-none"
                  style={{ fontSize: '16px' }}
                  autoFocus
                />
                
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Quick start:</p>
                  <div className="flex flex-wrap gap-2">
                    {displayedStarters.map((starter) => (
                      <button
                        key={starter}
                        onClick={() => {
                          setIdentitySeed(`I'm becoming someone who ${starter}`);
                          // Track click for split testing
                          setStarterClicks(prev => ({ ...prev, [starter]: (prev[starter] || 0) + 1 }));
                          // Log to console for now (can be sent to analytics later)
                          console.log('[Split Test] Starter clicked:', starter);
                        }}
                        className="text-xs px-2.5 py-1.5 rounded-full bg-muted hover:bg-primary/10 hover:text-primary transition-colors"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button onClick={() => setFlowStep("values")} className="flex-1 gap-2">
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>

                <div className="pt-4 text-center border-t border-border mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsLogin(true);
                      setFlowStep("auth");
                    }}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Already have an account? <span className="font-medium text-primary">Sign in</span>
                  </button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* STEP 2: Values */}
        {flowStep === "values" && (
          <motion.div
            key="values"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md"
          >
            <Card className="shadow-lg">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Target className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-2xl font-bold">Pick 3 values</CardTitle>
                <CardDescription>What guides your decisions?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2 justify-center">
                  {CORE_VALUES.map((value) => {
                    const isSelected = selectedValues.includes(value);
                    return (
                      <button
                        key={value}
                        onClick={() => toggleValue(value)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                          isSelected
                            ? 'bg-primary text-primary-foreground scale-105'
                            : 'bg-muted hover:bg-muted/80 text-foreground'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 inline mr-1" />}
                        {value}
                      </button>
                    );
                  })}
                </div>

                {/* Custom value input */}
                <div className="flex gap-2">
                  <Input
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    placeholder="Or type your own..."
                    className="flex-1 text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomValue())}
                  />
                  <Button 
                    type="button"
                    variant="outline" 
                    size="sm"
                    onClick={addCustomValue}
                    disabled={!customValue.trim() || selectedValues.length >= 3}
                  >
                    Add
                  </Button>
                </div>

                <p className="text-sm text-center text-muted-foreground">
                  {selectedValues.length}/3 selected
                </p>

                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setFlowStep("identity")} className="flex-1">
                    Back
                  </Button>
                  <Button 
                    onClick={() => setFlowStep("preview")} 
                    className="flex-1 gap-2"
                    disabled={selectedValues.length === 0}
                  >
                    See Your Invitation
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* STEP 3: Preview Invitation */}
        {flowStep === "preview" && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md space-y-4"
          >
            {/* Today's Invitation Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="relative"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur-lg" />
              <Card className="relative border-2 border-primary/30">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium text-primary">Today's Invitation</span>
                  </div>
                  
                  <p className="text-lg font-semibold mb-3">
                    {getPersonalizedInvitation().action}
                  </p>
                  
                  <p className="text-muted-foreground text-sm mb-4">
                    {getPersonalizedInvitation().insight}
                  </p>
                  
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Based on:</span>
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {getPersonalizedInvitation().source}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Identity summary */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="space-y-3"
            >
              {identitySeed && (
                <div className="p-3 rounded-xl bg-muted/50 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Your identity:</p>
                  <p className="text-sm font-medium">{identitySeed}</p>
                </div>
              )}
              
              <div className="flex flex-wrap gap-2 justify-center">
                {selectedValues.map(v => (
                  <span key={v} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium">
                    {v}
                  </span>
                ))}
              </div>
            </motion.div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="space-y-3 pt-2"
            >
              <Button 
                size="lg" 
                className="w-full h-12 font-semibold gap-2"
                onClick={proceedToAuth}
              >
                Save & Create Account
                <ArrowRight className="h-4 w-4" />
              </Button>
              
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setFlowStep("values")}
                className="w-full text-muted-foreground"
              >
                ← Go back and edit
              </Button>
            </motion.div>
          </motion.div>
        )}

        {/* AUTH FORM */}
        {flowStep === "auth" && (
          <motion.div
            key="auth"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md"
          >
            <Card className="shadow-lg">
              <CardHeader className="space-y-1 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
                  <Brain className="h-6 w-6 text-primary-foreground" />
                </div>
                <CardTitle className="text-2xl font-bold">{getTitle()}</CardTitle>
                <CardDescription>{getDescription()}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAuth} className="space-y-4">
                  {/* Full Name - only for signup */}
                  {!isLogin && !isForgotPassword && !isResettingPassword && (
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full Name</Label>
                      <Input
                        id="fullName"
                        placeholder="John Doe"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                      />
                    </div>
                  )}

                  {/* Email */}
                  {!isResettingPassword && (
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                  )}

                  {/* Password */}
                  {(!isForgotPassword || isResettingPassword) && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">
                          {isResettingPassword ? "New Password" : "Password"}
                        </Label>
                        {isLogin && !isResettingPassword && (
                          <button
                            type="button"
                            onClick={() => setIsForgotPassword(true)}
                            className="text-xs text-muted-foreground hover:text-primary hover:underline"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Confirm Password */}
                  {isResettingPassword && (
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm New Password</Label>
                      <Input
                        id="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={6}
                      />
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={loading}>
                    {getButtonText()}
                  </Button>
                </form>

                {/* Navigation links */}
                {!isResettingPassword && (
                  <div className="mt-4 text-center text-sm space-y-2">
                    {isForgotPassword ? (
                      <button
                        type="button"
                        onClick={() => setIsForgotPassword(false)}
                        className="text-primary hover:underline"
                      >
                        Back to sign in
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-primary hover:underline"
                      >
                        {isLogin ? "Need an account? Sign up" : "Already have an account? Sign in"}
                      </button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Auth;

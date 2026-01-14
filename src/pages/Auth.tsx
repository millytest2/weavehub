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

// Quick identity starters
const IDENTITY_STARTERS = [
  "ships weekly, not someday",
  "moves before screens",
  "builds in public",
  "chooses depth over distraction",
  "creates more than consumes",
];

// Sample "Today's Invitation" based on values
const SAMPLE_INVITATIONS = [
  {
    action: "Take 10 minutes to outline ONE thing you've been putting off",
    insight: "Your saved content shows a pattern: you know what to do, you're just waiting for permission. This is it.",
    source: "Based on your value of Action"
  },
  {
    action: "Block 30 minutes today for deep work—no notifications, no tabs",
    insight: "Focus isn't found, it's created. Start with one protected block.",
    source: "Based on your value of Focus"
  },
  {
    action: "Send one message to someone you've been meaning to reach out to",
    insight: "Connection compounds. One message today could change everything.",
    source: "Based on your value of Connection"
  }
];

type FlowStep = "identity" | "values" | "preview" | "auth";

const Auth = () => {
  const navigate = useNavigate();
  
  // Check if returning user (has visited before)
  const hasVisitedBefore = localStorage.getItem("weave_visited") === "true";
  
  // Flow state
  const [flowStep, setFlowStep] = useState<FlowStep>(hasVisitedBefore ? "auth" : "identity");
  const [identitySeed, setIdentitySeed] = useState("");
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  
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

  const getPersonalizedInvitation = () => {
    if (selectedValues.includes("Action") || selectedValues.includes("Discipline")) {
      return SAMPLE_INVITATIONS[0];
    }
    if (selectedValues.includes("Focus") || selectedValues.includes("Depth") || selectedValues.includes("Clarity")) {
      return SAMPLE_INVITATIONS[1];
    }
    if (selectedValues.includes("Connection") || selectedValues.includes("Authenticity")) {
      return SAMPLE_INVITATIONS[2];
    }
    return SAMPLE_INVITATIONS[0];
  };

  const proceedToAuth = () => {
    // Mark as visited
    localStorage.setItem("weave_visited", "true");
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
            await supabase.from("identity_seeds").insert({
              user_id: data.user.id,
              content: identitySeed || "Someone who takes action daily.",
              core_values: selectedValues.join(", ") || null,
            });
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
                <CardDescription>One sentence. This sharpens everything.</CardDescription>
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
                    {IDENTITY_STARTERS.map((starter) => (
                      <button
                        key={starter}
                        onClick={() => setIdentitySeed(`I'm becoming someone who ${starter}`)}
                        className="text-xs px-2.5 py-1.5 rounded-full bg-muted hover:bg-primary/10 hover:text-primary transition-colors"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button 
                    variant="ghost" 
                    onClick={() => {
                      localStorage.setItem("weave_visited", "true");
                      setFlowStep("auth");
                    }} 
                    className="flex-1 text-muted-foreground"
                  >
                    Skip
                  </Button>
                  <Button onClick={() => setFlowStep("values")} className="flex-1 gap-2">
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </Button>
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
                  
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {getPersonalizedInvitation().source}
                  </span>
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

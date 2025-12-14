import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/components/auth/AuthProvider";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Users, Lightbulb, FlaskConical, FileText, TrendingUp, Calendar, Clock, Flame, Sparkles } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface Analytics {
  total_users: number;
  users_this_week: number;
  users_this_month: number;
  total_insights: number;
  total_experiments: number;
  total_documents: number;
}

interface UserData {
  id: string;
  full_name: string;
  created_at: string;
  last_active: string | null;
  insights_count: number;
  experiments_count: number;
  documents_count: number;
  actions_completed: number;
  has_identity_seed: boolean;
  current_streak: number;
}

const Admin = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }

    if (!adminLoading && !isAdmin) {
      navigate("/");
      return;
    }
  }, [user, authLoading, isAdmin, adminLoading, navigate]);

  useEffect(() => {
    const fetchData = async () => {
      if (!isAdmin) return;

      try {
        const [analyticsResult, usersResult] = await Promise.all([
          supabase.rpc('get_admin_analytics'),
          supabase.rpc('get_admin_users')
        ]);

        if (analyticsResult.data && analyticsResult.data[0]) {
          setAnalytics(analyticsResult.data[0] as Analytics);
        }

        if (usersResult.data) {
          setUsers(usersResult.data as UserData[]);
        }
      } catch (error) {
        console.error('Error fetching admin data:', error);
      } finally {
        setLoadingData(false);
      }
    };

    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin]);

  const getActivityStatus = (lastActive: string | null) => {
    if (!lastActive) return { label: "Never", color: "bg-muted text-muted-foreground" };
    
    const lastActiveDate = new Date(lastActive);
    const now = new Date();
    const diffHours = (now.getTime() - lastActiveDate.getTime()) / (1000 * 60 * 60);
    
    if (diffHours < 24) return { label: "Active today", color: "bg-green-500/20 text-green-500" };
    if (diffHours < 72) return { label: "Recent", color: "bg-yellow-500/20 text-yellow-500" };
    if (diffHours < 168) return { label: "This week", color: "bg-orange-500/20 text-orange-500" };
    return { label: "Inactive", color: "bg-red-500/20 text-red-500" };
  };

  if (authLoading || adminLoading) {
    return (
      <MainLayout>
        <div className="p-4 sm:p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const activeUsers = users.filter(u => {
    if (!u.last_active) return false;
    const diffHours = (new Date().getTime() - new Date(u.last_active).getTime()) / (1000 * 60 * 60);
    return diffHours < 168; // Active in last week
  }).length;

  const usersWithIdentity = users.filter(u => u.has_identity_seed).length;

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          <h1 className="text-2xl sm:text-3xl font-bold">Admin Dashboard</h1>
        </div>

        {/* Analytics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold">{analytics?.total_users || 0}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Active This Week
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <p className="text-3xl font-bold">{activeUsers}</p>
                  <p className="text-xs text-muted-foreground">
                    {analytics?.total_users ? Math.round((activeUsers / analytics.total_users) * 100) : 0}% of total
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                With Identity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <p className="text-3xl font-bold">{usersWithIdentity}</p>
                  <p className="text-xs text-muted-foreground">
                    {analytics?.total_users ? Math.round((usersWithIdentity / analytics.total_users) * 100) : 0}% completed setup
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                New This Month
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold">{analytics?.users_this_month || 0}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                Total Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold">{analytics?.total_insights || 0}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FlaskConical className="h-4 w-4" />
                Total Experiments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold">{analytics?.total_experiments || 0}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Total Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold">{analytics?.total_documents || 0}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Flame className="h-4 w-4" />
                Total Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold">{users.reduce((sum, u) => sum + u.actions_completed, 0)}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              All Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingData ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Active</TableHead>
                      <TableHead className="text-center">Streak</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                      <TableHead className="text-center">Insights</TableHead>
                      <TableHead className="text-center">Docs</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((userData) => {
                      const activityStatus = getActivityStatus(userData.last_active);
                      return (
                        <TableRow key={userData.id}>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">{userData.full_name || 'Anonymous'}</span>
                              {userData.has_identity_seed && (
                                <Badge variant="outline" className="w-fit text-xs py-0">
                                  <Sparkles className="h-3 w-3 mr-1" />
                                  Identity set
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${activityStatus.color} border-0`}>
                              {activityStatus.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {userData.last_active 
                              ? formatDistanceToNow(new Date(userData.last_active), { addSuffix: true })
                              : 'Never'
                            }
                          </TableCell>
                          <TableCell className="text-center">
                            {userData.current_streak > 0 ? (
                              <span className="flex items-center justify-center gap-1 text-orange-500">
                                <Flame className="h-4 w-4" />
                                {userData.current_streak}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center font-medium">{userData.actions_completed}</TableCell>
                          <TableCell className="text-center">{userData.insights_count}</TableCell>
                          <TableCell className="text-center">{userData.documents_count}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(userData.created_at), 'MMM d, yyyy')}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default Admin;

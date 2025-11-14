import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Trash2, Upload, Download, Plus, Sparkles } from "lucide-react";

const Documents = () => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchDocuments();
  }, [user]);

  const fetchDocuments = async () => {
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load documents");
      return;
    }

    setDocuments(data || []);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user!.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from("documents").insert({
        user_id: user!.id,
        title: file.name,
        file_path: fileName,
        file_type: file.type,
        file_size: file.size,
      });

      if (dbError) throw dbError;

      toast.success("Document uploaded");
      setTitle("");
      setSummary("");
      setIsDialogOpen(false);
      fetchDocuments();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { error } = await supabase.from("documents").insert({
        user_id: user!.id,
        title,
        summary,
      });

      if (error) throw error;

      toast.success("Document created");
      setTitle("");
      setSummary("");
      setIsDialogOpen(false);
      fetchDocuments();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = async (id: string, filePath?: string) => {
    try {
      if (filePath) {
        await supabase.storage.from('documents').remove([filePath]);
      }

      const { error } = await supabase.from("documents").delete().eq("id", id);
      if (error) throw error;

      toast.success("Document deleted");
      fetchDocuments();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDownload = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error("Failed to download file");
    }
  };

  const handleGenerateNextStep = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("navigator", {
        body: { context: "documents" }
      });

      if (error) throw error;

      toast.success(`Next step: ${data.one_thing}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium">Documents</h1>
          <p className="text-muted-foreground mt-2">
            Your active work and resources
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleGenerateNextStep} disabled={generating} variant="outline" size="sm">
            <Sparkles className="mr-2 h-4 w-4" />
            {generating ? "Generating..." : "Next Step"}
          </Button>
          <Button onClick={() => setIsDialogOpen(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {documents.map((doc) => (
          <Card key={doc.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-medium">{doc.title}</h3>
                <div className="flex gap-1">
                  {doc.file_path && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(doc.file_path, doc.title)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(doc.id, doc.file_path)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {doc.summary && (
                <p className="text-sm text-muted-foreground">{doc.summary}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="file-upload">Upload File</Label>
              <Input
                id="file-upload"
                type="file"
                onChange={handleFileUpload}
                disabled={uploading}
              />
            </div>
            <div className="text-center text-sm text-muted-foreground">or</div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="summary">Summary</Label>
                <Textarea
                  id="summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={3}
                />
              </div>
              <Button type="submit" className="w-full">
                Create Document
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Documents;

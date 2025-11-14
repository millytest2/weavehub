import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileText, Trash2, Upload, Download, Plus, Sparkles } from "lucide-react";

const Documents = () => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
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
      setOpen(false);
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
      setOpen(false);
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
      toast.error(error.message);
    }
  };

  const handleNextStep = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("navigator", {
        body: {}
      });

      if (error) throw error;

      toast.success(`${data.one_thing}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-12 py-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-light tracking-tight text-foreground">Projects</h1>
        <p className="text-muted-foreground">Your active work and documents</p>
      </div>

      <div className="flex gap-3">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="mr-2 h-4 w-4" />
              New
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-2xl font-light">Create Document</DialogTitle>
              <DialogDescription>Add a new project or upload a file</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Project name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="summary">Summary</Label>
                <Textarea
                  id="summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Brief description"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="file">Or upload a file</Label>
                <Input
                  id="file"
                  type="file"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Button 
          onClick={handleNextStep}
          disabled={generating}
          variant="outline"
          size="sm"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {generating ? "..." : "Next Step"}
        </Button>
      </div>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <FileText className="mb-4 h-12 w-12 text-muted-foreground opacity-20" />
          <p className="text-sm text-muted-foreground">No projects yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <Card key={doc.id} className="border-border/50 hover:border-border transition-colors">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-medium">{doc.title}</h3>
                    </div>
                    {doc.summary && (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {doc.summary}
                      </p>
                    )}
                    {doc.file_path && (
                      <p className="text-xs text-muted-foreground">
                        {(doc.file_size / 1024).toFixed(1)} KB
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {doc.file_path && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownload(doc.file_path, doc.title)}
                        className="h-8 w-8"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(doc.id, doc.file_path)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Documents;

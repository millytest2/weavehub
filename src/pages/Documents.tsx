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
import { Trash2, Upload, Download, Plus, FileText } from "lucide-react";

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
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your knowledge base
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} size="sm" className="bg-primary hover:bg-primary/90">
          <Plus className="mr-2 h-4 w-4" />
          Add
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {documents.map((doc) => (
          <Card key={doc.id} className="rounded-[10px] shadow-sm border-border/50">
            <CardContent className="pt-5">
              <div className="flex items-start gap-3 mb-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base mb-2">{doc.title}</h3>
                  {doc.summary && (
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-3">{doc.summary}</p>
                  )}
                  {doc.file_path && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload(doc.file_path, doc.title)}
                      className="h-7 text-xs border-primary/20 text-primary hover:bg-primary/10 hover:text-primary"
                    >
                      <Download className="mr-1.5 h-3 w-3" />
                      Download
                    </Button>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(doc.id, doc.file_path)}
                  className="h-8 w-8 p-0 shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
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
              <Label htmlFor="file">Upload File</Label>
              <Input
                id="file"
                type="file"
                onChange={handleFileUpload}
                disabled={uploading}
                className="mt-1.5"
              />
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or create manually</span>
              </div>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="summary">Summary</Label>
                <Textarea
                  id="summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={3}
                  className="mt-1.5"
                />
              </div>
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90">
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

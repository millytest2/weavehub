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
import { Trash2, Upload, Download, Plus, FileText, Eye } from "lucide-react";
import { z } from "zod";

const documentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
  summary: z.string().trim().max(5000, "Summary must be less than 5,000 characters"),
});

const Documents = () => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<any>(null);
  const [docContent, setDocContent] = useState("");
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

      const { data: docData, error: dbError } = await supabase.from("documents").insert({
        user_id: user!.id,
        title: file.name,
        file_path: fileName,
        file_type: file.type,
        file_size: file.size,
      }).select().single();

      if (dbError) throw dbError;

      toast.success("Document uploaded! Processing with AI...");
      
      // For PDFs and complex documents, we need to extract text properly
      try {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          console.log('Processing PDF:', file.name, 'Size:', file.size);
          
          // For PDFs, read as array buffer and send to edge function for processing
          const arrayBuffer = await file.arrayBuffer();
          console.log('ArrayBuffer size:', arrayBuffer.byteLength);
          
          const base64Content = btoa(
            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
          console.log('Base64 content length:', base64Content.length);
          
          console.log('Calling document-intelligence edge function...');
          const { data: aiData, error: aiError } = await supabase.functions.invoke('document-intelligence', {
            body: {
              documentId: docData.id,
              content: base64Content,
              title: file.name,
              isPdf: true
            }
          });

          console.log('Edge function response:', { aiData, aiError });

          if (aiError) {
            console.error('AI processing error:', aiError);
            toast.error("AI processing failed: " + (aiError.message || JSON.stringify(aiError)));
          } else if (aiData) {
            toast.success(`Document processed! Created ${aiData.insightsCreated || 0} insights.`);
          } else {
            toast.warning("Document uploaded but no response from AI");
          }
        } else {
          console.log('Processing text file:', file.name);
          
          // For text files, read as text
          const extractedContent = await file.text();
          console.log('Text content length:', extractedContent.length);
          
          const { data: aiData, error: aiError } = await supabase.functions.invoke('document-intelligence', {
            body: {
              documentId: docData.id,
              content: extractedContent.substring(0, 50000),
              title: file.name,
              isPdf: false
            }
          });

          console.log('Edge function response:', { aiData, aiError });

          if (aiError) {
            console.error('AI processing error:', aiError);
            toast.error("AI processing failed: " + (aiError.message || JSON.stringify(aiError)));
          } else if (aiData) {
            toast.success(`Document processed! Created ${aiData.insightsCreated || 0} insights.`);
          } else {
            toast.warning("Document uploaded but no response from AI");
          }
        }
      } catch (error) {
        console.error('Error processing document:', error);
        toast.error("Failed to process document: " + (error instanceof Error ? error.message : 'Unknown error'));
      } finally {
        fetchDocuments();
      }
      
      setTitle("");
      setSummary("");
      setIsDialogOpen(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate input
    const validation = documentSchema.safeParse({ title, summary });
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast.error(firstError.message);
      return;
    }

    try {
      const { error } = await supabase.from("documents").insert({
        user_id: user!.id,
        title: validation.data.title,
        summary: validation.data.summary,
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

  const handleViewDocument = async (doc: any) => {
    setViewingDoc(doc);
    setDocContent("");
    setIsViewOpen(true);

    if (!doc.file_path) {
      setDocContent(doc.summary || "No content available");
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(doc.file_path);

      if (error) throw error;

      // Try to read as text for text-based files
      const text = await data.text();
      setDocContent(text.substring(0, 50000)); // Limit to 50k chars
    } catch (error: any) {
      console.error('Error reading document:', error);
      setDocContent(doc.summary || "Cannot preview this file type. Use the download button to view it.");
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
          <h1 className="text-3xl font-bold text-foreground">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            PDFs, resources, and reference materials
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Upload Document
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {documents.map((doc) => (
          <Card key={doc.id} className="rounded-[10px] border-border/30 hover:shadow-lg hover:border-primary/50 transition-all duration-200">
            <CardContent className="pt-5">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleViewDocument(doc)}>
                  <h3 className="font-medium text-base mb-2 truncate" title={doc.title}>{doc.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                    {doc.summary || "No summary available"}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewDocument(doc);
                    }}
                    className="h-8 w-8 p-0"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  {doc.file_path && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(doc.file_path, doc.title);
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(doc.id, doc.file_path);
                    }}
                    className="h-8 w-8 p-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
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

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{viewingDoc?.title || "View Document"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {viewingDoc?.summary && (
              <div>
                <Label className="text-sm font-medium">AI Summary</Label>
                <p className="text-sm text-muted-foreground mt-1 p-3 bg-muted rounded-md">
                  {viewingDoc.summary}
                </p>
              </div>
            )}
            <div>
              <Label className="text-sm font-medium">Content Preview</Label>
              <Textarea
                value={docContent}
                readOnly
                className="mt-1.5 min-h-[400px] font-mono text-xs"
                placeholder="Loading content..."
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Documents;

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Trash2, Upload, Download, Plus, FileText, Eye } from "lucide-react";
import { z } from "zod";
import * as pdfjs from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
// @ts-ignore - browser build has no types
import mammoth from 'mammoth/mammoth.browser';

// Set up PDF.js worker with correct version
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.394/build/pdf.worker.min.mjs`;

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [runAnalysis, setRunAnalysis] = useState(false);

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

  const extractPdfText = async (file: File): Promise<string> => {
    try {
      console.log('Starting PDF extraction for:', file.name, 'Size:', file.size);
      const arrayBuffer = await file.arrayBuffer();
      console.log('ArrayBuffer loaded, length:', arrayBuffer.byteLength);
      
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      console.log('PDF loaded successfully, pages:', pdf.numPages);
      
      let fullText = '';
      
      // First, try standard text extraction
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n';
        
        if (i % 10 === 0) {
          console.log(`Processed ${i}/${pdf.numPages} pages, text length so far: ${fullText.length}`);
        }
      }
      
      console.log('PDF extraction complete. Total text length:', fullText.length);
      
      // If no text was extracted, try OCR
      if (!fullText.trim() || fullText.trim().length < 100) {
        console.log('No readable text found, attempting OCR...');
        toast.info('Image-based PDF detected. Running OCR... This may take a moment.');
        
        fullText = await performOCR(pdf);
        
        if (!fullText.trim()) {
          toast.error('Failed to extract text using OCR. The PDF may be corrupted or empty.');
          throw new Error('No readable text found in PDF after OCR');
        }
        
        toast.success('OCR completed successfully!');
      }
      
      return fullText.trim();
    } catch (error) {
      console.error('PDF extraction error:', error);
      toast.error('Failed to extract text from PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
      throw error;
    }
  };

  const performOCR = async (pdf: any): Promise<string> => {
    const worker = await createWorker('eng');
    let ocrText = '';
    
    try {
      const totalPages = pdf.numPages;
      const maxPages = Math.min(totalPages, 20); // Limit to 20 pages for performance
      
      if (totalPages > maxPages) {
        toast.info(`Processing first ${maxPages} of ${totalPages} pages with OCR`);
      }
      
      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        
        // Render page to canvas
        const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        if (!context) {
          console.error('Failed to get canvas context');
          continue;
        }
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;
        
        // Convert canvas to image data and run OCR
        const imageData = canvas.toDataURL('image/png');
        const { data: { text } } = await worker.recognize(imageData);
        
        ocrText += text + '\n';
        
        // Update progress
        if (i % 5 === 0 || i === maxPages) {
          toast.info(`OCR progress: ${i}/${maxPages} pages processed`);
        }
        
        console.log(`OCR page ${i}/${maxPages} complete, extracted ${text.length} characters`);
      }
      
      console.log('OCR complete. Total extracted length:', ocrText.length);
      return ocrText;
    } finally {
      await worker.terminate();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setSelectedFile(file);
    setUploadTitle(file.name);
  };

  const handleConfirmUpload = async () => {
    if (!selectedFile) return;
    
    setUploading(true);
    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${user!.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      const { data: docData, error: dbError } = await supabase.from("documents").insert({
        user_id: user!.id,
        title: uploadTitle || selectedFile.name,
        file_path: fileName,
        file_type: selectedFile.type,
        file_size: selectedFile.size,
      }).select().single();

      if (dbError) throw dbError;

      toast.success("Document uploaded!");
      
      // Only run AI analysis if toggle is ON
      if (runAnalysis) {
        toast.info("Extracting text from document...");
        
        try {
          let extractedContent = '';
          
          if (selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf')) {
            extractedContent = await extractPdfText(selectedFile);
            console.log('Extracted content preview:', extractedContent.substring(0, 500));
          } else {
            extractedContent = await selectedFile.text();
            console.log('Text file content length:', extractedContent.length);
          }
          
          if (!extractedContent || extractedContent.trim().length < 50) {
            toast.error("Document has no readable content");
            return;
          }
          
          toast.info("Analyzing with AI...");
          console.log('Sending to AI, content length:', extractedContent.length);
          
          // Verify session is valid and refresh if needed
          const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
          
          if (sessionError) {
            console.error('Session error:', sessionError);
            toast.error("Session error. Please log in again.");
            return;
          }
          
          if (!currentSession) {
            console.error('No active session found');
            toast.error("Your session has expired. Please log in again.");
            return;
          }
          
          console.log('Session valid, token expires at:', new Date(currentSession.expires_at! * 1000).toISOString());
          
          // Check if session is about to expire (within 5 minutes)
          const now = Math.floor(Date.now() / 1000);
          if (currentSession.expires_at && (currentSession.expires_at - now) < 300) {
            console.log('Session expiring soon, refreshing...');
            const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
            
            if (refreshError || !refreshedSession) {
              console.error('Failed to refresh session:', refreshError);
              toast.error("Session expired. Please log in again.");
              return;
            }
            
            console.log('Session refreshed successfully');
          }
          
          const { data: aiData, error: aiError } = await supabase.functions.invoke('document-intelligence', {
            body: {
              documentId: docData.id,
              content: extractedContent.substring(0, 50000),
              title: uploadTitle || selectedFile.name
            },
            headers: {
              Authorization: `Bearer ${ (await supabase.auth.getSession()).data.session?.access_token ?? '' }`,
            }
          });

          console.log('AI response:', { aiData, aiError });

          if (aiError) {
            console.error('AI processing error:', aiError);
            
            // Handle specific error cases
            if (aiError.message?.includes('401') || aiError.message?.includes('Unauthorized') || aiError.message?.includes('Authentication failed')) {
              toast.error("Authentication failed. Please refresh the page and log in again.");
            } else {
              toast.error("AI processing failed: " + (aiError.message || JSON.stringify(aiError)));
            }
          } else if (aiData) {
            toast.success(`AI analysis complete! Created ${aiData.insightsCreated || 0} insights.`);
          }
        } catch (error) {
          console.error('Error processing document:', error);
          toast.error("Processing failed: " + (error instanceof Error ? error.message : 'Unknown error'));
        }
      }
      
      fetchDocuments();
      setSelectedFile(null);
      setUploadTitle("");
      setRunAnalysis(false);
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {documents.map((doc) => (
          <Card key={doc.id} className="rounded-[10px] border-border/30 hover:shadow-lg hover:border-primary/50 transition-all duration-200">
            <CardContent className="pt-5">
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-base mb-1 truncate cursor-pointer hover:text-primary transition-colors" title={doc.title} onClick={() => handleViewDocument(doc)}>
                      {doc.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : 'Unknown size'}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 cursor-pointer" onClick={() => handleViewDocument(doc)}>
                  {doc.summary || "No summary available"}
                </p>
                <div className="flex gap-1 pt-2 border-t border-border/30">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewDocument(doc)}
                    className="flex-1 h-8 text-xs"
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    View
                  </Button>
                  {doc.file_path && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(doc.file_path, doc.title)}
                      className="flex-1 h-8 text-xs"
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      Download
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(doc.id, doc.file_path)}
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
                onChange={handleFileSelect}
                disabled={uploading}
                className="mt-1.5"
              />
            </div>
            {selectedFile && (
              <>
                <div>
                  <Label htmlFor="uploadTitle">Document Title</Label>
                  <Input
                    id="uploadTitle"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Enter document title"
                    className="mt-1.5"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="runAnalysis" className="text-sm font-medium">
                    Analyze with AI
                  </Label>
                  <Switch
                    id="runAnalysis"
                    checked={runAnalysis}
                    onCheckedChange={setRunAnalysis}
                  />
                </div>
                <Button 
                  onClick={handleConfirmUpload} 
                  disabled={uploading}
                  className="w-full"
                >
                  {uploading ? "Uploading..." : "Save Upload"}
                </Button>
              </>
            )}
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

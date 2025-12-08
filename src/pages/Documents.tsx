import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Trash2, Upload, Download, Plus, FileText, Eye, Loader2 } from "lucide-react";
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

const PAGE_SIZE = 50;

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
  const [videoUrl, setVideoUrl] = useState("");
  const [videoMode, setVideoMode] = useState<"file" | "youtube" | "instagram">("file");
  const [isReExtracting, setIsReExtracting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    fetchDocuments(true);
  }, [user]);

  const fetchDocuments = useCallback(async (reset = false) => {
    if (!user) return;
    
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    const offset = reset ? 0 : documents.length;

    try {
      // Get total count first (only on reset)
      if (reset) {
        const { count } = await supabase
          .from("documents")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id);
        setTotalCount(count || 0);
      }

      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        toast.error("Failed to load documents");
        return;
      }

      const newDocs = data || [];
      
      if (reset) {
        setDocuments(newDocs);
      } else {
        setDocuments(prev => [...prev, ...newDocs]);
      }

      setHasMore(newDocs.length === PAGE_SIZE);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, documents.length]);

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
    setVideoMode("file");
  };

  const handleVideoSubmit = async () => {
    if (!videoUrl.trim()) {
      toast.error("Please enter a video URL");
      return;
    }

    const isInstagram = videoUrl.includes('instagram.com');
    const isYoutube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');

    if (!isInstagram && !isYoutube) {
      toast.error("Please enter a valid YouTube or Instagram URL");
      return;
    }

    setUploading(true);
    try {
      const functionName = isInstagram ? "instagram-processor" : "youtube-processor";
      const bodyKey = isInstagram ? "instagramUrl" : "youtubeUrl";
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { [bodyKey]: videoUrl, title: uploadTitle }
      });

      if (error) throw error;

      toast.success(data.insightsCreated 
        ? `Video processed! Created ${data.insightsCreated} insights.`
        : data.message || "Video saved successfully!"
      );
      
      await fetchDocuments();
      setVideoUrl("");
      setUploadTitle("");
      setIsDialogOpen(false);
    } catch (error: any) {
      console.error("Video processing error:", error);
      toast.error(error.message || "Failed to process video");
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmUpload = async () => {
    if (!selectedFile) return;
    
    if (!user) {
      toast.error("You must be logged in to upload documents");
      return;
    }
    
    setUploading(true);
    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      console.log('[Upload] Starting upload to bucket "documents" with path:', fileName);
      console.log('[Upload] User ID:', user.id);

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, selectedFile);

      if (uploadError) {
        console.error('[Upload] Storage error:', uploadError);
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      console.log('[Upload] File uploaded successfully, inserting DB row...');

      // Extract content first for storage
      let extractedContent = '';
      try {
        if (selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf')) {
          toast.info("Extracting text from PDF...");
          extractedContent = await extractPdfText(selectedFile);
        } else if (selectedFile.type.startsWith('text/') || selectedFile.name.match(/\.(txt|md|json|xml|csv)$/i)) {
          extractedContent = await selectedFile.text();
        }
      } catch (extractError) {
        console.error('Content extraction error:', extractError);
        // Continue without extracted content
      }

      const { data: docData, error: dbError } = await supabase.from("documents").insert({
        user_id: user.id,
        title: uploadTitle || selectedFile.name,
        file_path: fileName,
        file_type: selectedFile.type,
        file_size: selectedFile.size,
        extracted_content: extractedContent ? extractedContent.substring(0, 100000) : null, // Store up to 100KB
      }).select().single();

      if (dbError) {
        console.error('[Upload] DB insert error:', dbError);
        throw new Error(`DB insert failed: ${dbError.message}`);
      }

      console.log('[Upload] Document record created:', docData.id);

      toast.success("Document uploaded!");
      
      // Only run AI analysis if toggle is ON
      if (runAnalysis && extractedContent && extractedContent.trim().length >= 50) {
        toast.info("Analyzing with AI...");
        console.log('Sending to AI, content length:', extractedContent.length);
        
        try {
          const { data: aiData, error: aiError } = await supabase.functions.invoke('document-intelligence', {
            body: {
              documentId: docData.id,
              content: extractedContent.substring(0, 50000),
              title: uploadTitle || selectedFile.name
            }
          });

          console.log('AI response:', { aiData, aiError });

          if (aiError) {
            console.error('AI processing error:', aiError);
            toast.error("AI processing failed: " + (aiError.message || JSON.stringify(aiError)));
          } else if (aiData) {
            toast.success(`AI analysis complete! Created ${aiData.insightsCreated || 0} insights.`);
          }
        } catch (error) {
          console.error('Error processing document:', error);
          toast.error("Processing failed: " + (error instanceof Error ? error.message : 'Unknown error'));
        }
      }
      
      await fetchDocuments();
      setSelectedFile(null);
      setUploadTitle("");
      setRunAnalysis(false);
      setIsDialogOpen(false);
    } catch (error: any) {
      console.error('[Upload] Unexpected error:', error);
      toast.error(error.message || "Failed to upload document");
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

    // Priority 1: Use extracted_content if available (works for PDFs, transcripts)
    if (doc.extracted_content) {
      setDocContent(doc.extracted_content);
      return;
    }

    // Priority 2: Try to download and read text files
    if (doc.file_path) {
      const isTextFile = doc.file_type?.startsWith('text/') || 
                         doc.file_path.match(/\.(txt|md|json|xml|csv)$/i);
      
      if (isTextFile) {
        try {
          const { data, error } = await supabase.storage
            .from('documents')
            .download(doc.file_path);

          if (!error && data) {
            const text = await data.text();
            setDocContent(text.substring(0, 50000));
            return;
          }
        } catch (error) {
          console.error('Error reading document:', error);
        }
      }
    }

    // Priority 3: Show message that extraction is needed
    setDocContent(doc.file_path 
      ? "Full content not extracted yet. Click 'Re-extract' to load the complete document."
      : "No content available.");
  };

  const handleReExtract = async () => {
    if (!viewingDoc || !viewingDoc.file_path) return;
    
    setIsReExtracting(true);
    try {
      // Download file
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('documents')
        .download(viewingDoc.file_path);

      if (downloadError) throw downloadError;

      let extractedContent = '';
      const isPdf = viewingDoc.file_type === 'application/pdf' || viewingDoc.file_path.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        toast.info("Extracting text from PDF...");
        const arrayBuffer = await fileData.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          extractedContent += pageText + '\n';
        }

        // If no text, try OCR
        if (!extractedContent.trim() || extractedContent.trim().length < 100) {
          toast.info("Running OCR on image-based PDF...");
          extractedContent = await performOCR(pdf);
        }
      } else {
        extractedContent = await fileData.text();
      }

      if (!extractedContent.trim()) {
        toast.error("Could not extract content from this file");
        return;
      }

      // Save to database
      const { error: updateError } = await supabase
        .from('documents')
        .update({ extracted_content: extractedContent.substring(0, 100000) })
        .eq('id', viewingDoc.id);

      if (updateError) throw updateError;

      // Update view
      setDocContent(extractedContent);
      setViewingDoc({ ...viewingDoc, extracted_content: extractedContent });
      
      // Refresh documents list
      await fetchDocuments();
      
      toast.success("Content extracted successfully!");
    } catch (error: any) {
      console.error('Re-extract error:', error);
      const errorMsg = error?.message || error?.name || (typeof error === 'string' ? error : 'PDF extraction failed - try re-uploading');
      toast.error("Failed to extract: " + errorMsg);
    } finally {
      setIsReExtracting(false);
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
    <div className="space-y-6 max-w-6xl mx-auto px-4 sm:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            PDFs, resources, and reference materials
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Upload
        </Button>
      </div>

      {loading && documents.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {documents.map((doc) => (
          <Card key={doc.id} className="rounded-[10px] border-border/30 hover:shadow-lg hover:border-primary/50 transition-all duration-200">
            <CardContent className="p-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm sm:text-base mb-0.5 truncate cursor-pointer hover:text-primary transition-colors" title={doc.title} onClick={() => handleViewDocument(doc)}>
                      {doc.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : 'Unknown size'}
                    </p>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-2 cursor-pointer" onClick={() => handleViewDocument(doc)}>
                  {doc.summary || "No summary available"}
                </p>
                <div className="flex gap-1 pt-2 border-t border-border/30">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewDocument(doc)}
                    className="flex-1 h-8 text-xs px-2"
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    View
                  </Button>
                  {doc.file_path && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(doc.file_path, doc.title)}
                      className="flex-1 h-8 text-xs px-2"
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      Download
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(doc.id, doc.file_path)}
                    className="h-8 w-8 p-0 shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Load More Button */}
      {hasMore && documents.length > 0 && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => fetchDocuments(false)}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              `Load More (${documents.length} of ${totalCount})`
            )}
          </Button>
        </div>
      )}
      </>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-full max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Content</DialogTitle>
            <DialogDescription>Upload files, videos, or create documents</DialogDescription>
          </DialogHeader>
          
          <div className="flex gap-2 border-b border-border pb-3 mb-4 flex-wrap">
            <Button
              variant={videoMode === "file" ? "default" : "outline"}
              onClick={() => { setVideoMode("file"); setVideoUrl(""); }}
              size="sm"
            >
              Upload File
            </Button>
            <Button
              variant={videoMode === "youtube" ? "default" : "outline"}
              onClick={() => { setVideoMode("youtube"); setSelectedFile(null); }}
              size="sm"
            >
              YouTube
            </Button>
            <Button
              variant={videoMode === "instagram" ? "default" : "outline"}
              onClick={() => { setVideoMode("instagram"); setSelectedFile(null); }}
              size="sm"
            >
              Instagram
            </Button>
          </div>

          <div className="space-y-4">
            {videoMode === "file" ? (
              <>
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
              </>
            ) : videoMode === "youtube" ? (
              <>
                <div>
                  <Label htmlFor="videoUrl">YouTube URL</Label>
                  <Input
                    id="videoUrl"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=... or https://youtu.be/..."
                    className="mt-1.5"
                    style={{ fontSize: '16px' }}
                  />
                </div>
                <div>
                  <Label htmlFor="ytTitle">Title (optional)</Label>
                  <Input
                    id="ytTitle"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Leave empty to use video title"
                    className="mt-1.5"
                    style={{ fontSize: '16px' }}
                  />
                </div>
                <Button 
                  onClick={handleVideoSubmit}
                  disabled={uploading || !videoUrl.trim()} 
                  className="w-full"
                >
                  {uploading ? "Processing..." : "Process YouTube Video"}
                </Button>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="instagramUrl">Instagram URL</Label>
                  <Input
                    id="instagramUrl"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://instagram.com/p/... or https://instagram.com/reel/..."
                    className="mt-1.5"
                    style={{ fontSize: '16px' }}
                  />
                </div>
                <div>
                  <Label htmlFor="igTitle">Title (optional)</Label>
                  <Input
                    id="igTitle"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Leave empty to use post title"
                    className="mt-1.5"
                    style={{ fontSize: '16px' }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Instagram videos are saved with metadata. Full transcription requires OpenAI API key.
                </p>
                <Button 
                  onClick={handleVideoSubmit}
                  disabled={uploading || !videoUrl.trim()} 
                  className="w-full"
                >
                  {uploading ? "Processing..." : "Process Instagram"}
                </Button>
              </>
            )}
            
            {videoMode === "file" && !selectedFile && (
              <>
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
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{viewingDoc?.title || "View Document"}</DialogTitle>
            <DialogDescription>AI analysis and full document content</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* AI Summary Section - First */}
            {viewingDoc?.summary && (
              <div>
                <Label className="text-sm font-medium">AI Summary</Label>
                <div className="mt-2 p-3 bg-primary/5 border border-primary/20 rounded-md">
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    {viewingDoc.summary}
                  </p>
                </div>
              </div>
            )}
            
            {/* Full Content Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Full Content</Label>
                {viewingDoc?.file_path && !viewingDoc?.extracted_content && viewingDoc?.file_type !== 'youtube_video' && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={handleReExtract}
                    disabled={isReExtracting}
                  >
                    {isReExtracting ? "Extracting..." : "Re-extract"}
                  </Button>
                )}
              </div>
              <div className="bg-muted/50 rounded-md p-3 max-h-[300px] overflow-y-auto">
                <pre className="text-xs whitespace-pre-wrap font-mono text-foreground/80">
                  {docContent || "Loading..."}
                </pre>
              </div>
              {viewingDoc?.file_type === 'youtube_video' && viewingDoc?.file_path && (
                <a 
                  href={viewingDoc.file_path} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-sm text-primary hover:underline"
                >
                  Watch on YouTube
                </a>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Documents;

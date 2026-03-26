/**
 * ExternalUploadPanel — Dedicated section for uploading external images
 * that are not linked to the script/storyboard.
 */

import { useState, useRef } from "react";
import { Upload, ImagePlus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ExternalUploadPanelProps {
  projectId: string;
  userId: string;
  onUploaded: (upload: { id: string; imageUrl: string; label: string }) => void;
}

export default function ExternalUploadPanel({ projectId, userId, onUploaded }: ExternalUploadPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [label, setLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Seules les images sont acceptées");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image trop volumineuse (max 10 Mo)");
      return;
    }

    setUploading(true);
    try {
      const id = crypto.randomUUID();
      const ext = file.name.split(".").pop() ?? "jpg";
      const filePath = `${projectId}/external/${id}.${ext}`;

      // Upload to storage
      const { error: storageError } = await supabase.storage
        .from("shot-images")
        .upload(filePath, file, { contentType: file.type, upsert: true });

      if (storageError) throw storageError;

      const { data: urlData } = supabase.storage.from("shot-images").getPublicUrl(filePath);
      const imageUrl = urlData.publicUrl;

      // Insert DB record
      const { error: dbError } = await supabase.from("external_uploads" as any).insert({
        id,
        user_id: userId,
        project_id: projectId,
        image_url: imageUrl,
        label: label || file.name,
        display_order: 0,
      });

      if (dbError) throw dbError;

      onUploaded({ id, imageUrl, label: label || file.name });
      setLabel("");
      toast.success("Image uploadée");
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Erreur d'upload : " + (err.message ?? "inconnue"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <ImagePlus className="h-4 w-4 text-violet-400" />
        <h3 className="text-sm font-medium text-foreground">Images externes</h3>
        <span className="text-[10px] text-muted-foreground">(hors script)</span>
      </div>

      <div className="flex gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Description (optionnel)"
          className="text-xs h-8 flex-1"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {uploading ? "Upload…" : "Uploader"}
        </Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <p className="text-[10px] text-muted-foreground mt-2">
        Uploadez une image pour générer une vidéo indépendamment du script. Max 10 Mo.
      </p>
    </div>
  );
}

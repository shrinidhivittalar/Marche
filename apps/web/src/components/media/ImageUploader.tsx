import React, { useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { Button } from '@marche/ui';
import { ApiError } from '../../lib/api';
import { mediaApi, type UploadedImage } from '../../lib/media-api';

// Real file uploads, replacing the pasted-URL fields that stood in for them.
//
// Three steps, all driven from here: ask the API to authorise an upload,
// PUT the file straight to storage, then tell the API it landed. The file
// never passes through the API — the browser talks to storage directly with
// a short-lived signed URL.
//
// A file only becomes attachable once the server confirms it arrived and
// matches its declared type, so nothing here can put a broken or dangerous
// image on a public page.

const ACCEPT = 'image/jpeg,image/png,image/webp';

export const ImageUploader: React.FC<{
  token: string;
  images: UploadedImage[];
  max: number;
  disabled?: boolean;
  onChange: (images: UploadedImage[]) => void;
  label?: string;
}> = ({ token, images, max, disabled, onChange, label = 'Images' }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const atCapacity = images.length >= max;

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setBusy(true);

    try {
      const room = max - images.length;
      const chosen = Array.from(files).slice(0, room);
      if (files.length > room) {
        setError(`Only ${room} more image${room === 1 ? '' : 's'} can be added.`);
      }

      const uploaded: UploadedImage[] = [];
      for (const [index, file] of chosen.entries()) {
        setProgress(`Uploading ${index + 1} of ${chosen.length}…`);
        uploaded.push(await mediaApi.upload(token, file));
      }
      onChange([...images, ...uploaded]);
    } catch (err) {
      // The API's messages are specific and worth showing — "that file type
      // is not supported", "the limit is 10MB" — rather than a generic
      // failure the user cannot act on.
      setError(
        err instanceof ApiError
          ? err.message
          : "That file couldn't be uploaded. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
      setProgress(null);
      // Cleared so choosing the same file again still fires a change event.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3" data-testid="image-uploader">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="text-xs text-ink-muted" data-testid="uploader-count">
          {images.length} of {max}
        </span>
      </div>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-3" data-testid="uploaded-images">
          {images.map((image) => (
            <div
              key={image.mediaId}
              data-testid="uploaded-image"
              data-media-id={image.mediaId}
              className="relative w-24 h-24 rounded-lg overflow-hidden border border-border"
            >
              {image.url ? (
                <img src={image.url} alt={image.fileName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-surface-subtle flex items-center justify-center text-[10px] text-ink-muted px-1 text-center">
                  {image.fileName}
                </div>
              )}
              <button
                type="button"
                aria-label={`Remove ${image.fileName}`}
                data-testid={`remove-image-${image.mediaId}`}
                disabled={disabled || busy}
                onClick={() => onChange(images.filter((i) => i.mediaId !== image.mediaId))}
                className="absolute top-1 right-1 rounded-full bg-surface/90 p-1 text-ink-muted hover:text-danger"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        data-testid="file-input"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || busy || atCapacity}
          data-testid="choose-files"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-4 h-4 mr-2" />
          {busy ? 'Uploading…' : 'Upload images'}
        </Button>

        {progress && (
          <span className="text-xs text-ink-muted" data-testid="upload-progress">
            {progress}
          </span>
        )}
        {atCapacity && !busy && (
          <span className="text-xs text-ink-muted" data-testid="uploader-full">
            Maximum reached.
          </span>
        )}
      </div>

      {error && (
        <p role="alert" data-testid="upload-error" className="text-sm text-danger">
          {error}
        </p>
      )}

      <p className="text-xs text-ink-muted">JPEG, PNG or WebP, up to 10MB each.</p>
    </div>
  );
};

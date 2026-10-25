"use client";

/**
 * Arena photo picker: thumbnail grid, upload progress, remove. The first
 * photo is the cover (same convention the owner court cards already use —
 * images[0] as the card background), so order matters and is preserved.
 *
 * A photo uploaded here then removed before the form is saved becomes an
 * orphan file on the storage backend: there is no delete-by-URL route for an
 * image that was never attached to a saved arena/court record (only
 * update_arena's own "dropped from the images array" cleanup exists). This
 * is a known, documented limitation — not fixed here (see docs/FRAME_BRIEFS.md).
 */
import { useId, useState } from "react";
import { X } from "lucide-react";

import { ApiError } from "@/services/api";
import { fileProblem, uploadImage } from "@/services/uploads";

export const MAX_PHOTOS = 6;

interface Pending {
  id: string;
  name: string;
  previewUrl: string;
  progress: number;
  error: string | null;
}

export function PhotoUpload({
  images,
  onChange,
}: {
  images: string[];
  onChange: (next: string[]) => void;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const inputId = useId();
  const [capError, setCapError] = useState<string | null>(null);

  const slotsLeft = MAX_PHOTOS - images.length - pending.length;

  function removeSaved(url: string) {
    onChange(images.filter((u) => u !== url));
  }

  function removePending(id: string) {
    setPending((p) => {
      const found = p.find((x) => x.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return p.filter((x) => x.id !== id);
    });
  }

  function startUpload(file: File) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const previewUrl = URL.createObjectURL(file);
    setPending((p) => [...p, { id, name: file.name, previewUrl, progress: 0, error: null }]);

    uploadImage(file, "arenas", {
      onProgress: (percent) =>
        setPending((p) => p.map((x) => (x.id === id ? { ...x, progress: percent } : x))),
    })
      .then((url) => {
        setPending((p) => {
          const found = p.find((x) => x.id === id);
          if (found) URL.revokeObjectURL(found.previewUrl);
          return p.filter((x) => x.id !== id);
        });
        onChange([...images, url]);
      })
      .catch((err) => {
        const message = err instanceof ApiError ? err.message : "Could not upload that photo.";
        setPending((p) => p.map((x) => (x.id === id ? { ...x, error: message } : x)));
      });
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setCapError(null);

    const room = MAX_PHOTOS - images.length - pending.length;
    if (files.length > room) {
      setCapError(`Only ${MAX_PHOTOS} photos are allowed; ${room} more can be added.`);
    }
    for (const file of files.slice(0, Math.max(0, room))) {
      const problem = fileProblem(file);
      if (problem) {
        setPending((p) => [
          ...p,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: file.name,
            previewUrl: "",
            progress: 0,
            error: problem,
          },
        ]);
        continue;
      }
      startUpload(file);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {images.map((url, i) => (
          <div key={url} className="relative size-20 overflow-hidden rounded-lg border">
            {/* eslint-disable-next-line @next/next/no-img-element -- uploaded (Cloudinary/local) thumbnail, not a bundled asset */}
            <img
              src={url}
              alt={i === 0 ? "Cover photo" : "Arena photo"}
              className="size-full object-cover"
            />
            <button
              type="button"
              onClick={() => removeSaved(url)}
              aria-label="Remove photo"
              className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {pending.map((p) => (
          <div
            key={p.id}
            className="relative size-20 overflow-hidden rounded-lg border bg-muted"
            title={p.error ?? undefined}
          >
            {p.previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- blob: preview of the file just picked; next/image cannot load it
              <img src={p.previewUrl} alt="" className="size-full object-cover opacity-60" />
            )}
            {!p.error && (
              <div className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                {p.progress}%
              </div>
            )}
            <button
              type="button"
              onClick={() => removePending(p.id)}
              aria-label="Remove"
              className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {slotsLeft > 0 && (
          <label
            htmlFor={inputId}
            className="flex size-20 cursor-pointer items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-muted"
          >
            + Add
            <input
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={onPick}
            />
          </label>
        )}
      </div>
      {pending.some((p) => p.error) && (
        <ul className="mt-1.5 space-y-0.5">
          {pending
            .filter((p) => p.error)
            .map((p) => (
              <li key={p.id} className="text-sm text-destructive">
                {p.name}: {p.error}
              </li>
            ))}
        </ul>
      )}
      {capError && <p className="mt-1.5 text-sm text-destructive">{capError}</p>}
      <p className="mt-1.5 text-xs text-muted-foreground">
        Up to {MAX_PHOTOS} photos. The first photo is the cover.
      </p>
    </div>
  );
}

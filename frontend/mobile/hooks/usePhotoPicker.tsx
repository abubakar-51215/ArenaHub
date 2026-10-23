import { useCallback, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { showToast } from '@/components/ui/toast';
import { PHOTO_TEXT } from '@/constants/photos';
import { PhotoPermissionError, pickPhoto, type PhotoSource, type PickedPhoto } from '@/lib/pick-photo';
import type * as ImagePicker from 'expo-image-picker';

/**
 * "Add a photo": a sheet with Take photo and Choose from gallery (and Cancel). `choose()` opens it and
 * resolves with the photo, or null if the person closed it or the phone refused access (a short message
 * is shown then, nothing crashes). The caller still checks the file with `photoProblem`.
 */
export function usePhotoPicker(options: ImagePicker.ImagePickerOptions = {}): { choose: () => Promise<PickedPhoto | null>; sheet: ReactNode } {
  const [open, setOpen] = useState(false);
  const waiting = useRef<((photo: PickedPhoto | null) => void) | null>(null);

  const choose = useCallback(
    () =>
      new Promise<PickedPhoto | null>((resolve) => {
        waiting.current = resolve;
        setOpen(true);
      }),
    [],
  );

  const finish = (photo: PickedPhoto | null) => {
    setOpen(false);
    waiting.current?.(photo);
    waiting.current = null;
  };

  const pickFrom = async (source: PhotoSource) => {
    setOpen(false);
    try {
      finish(await pickPhoto({ ...options, source }));
    } catch (e) {
      showToast(e instanceof PhotoPermissionError && e.source === 'camera' ? PHOTO_TEXT.cameraOff : PHOTO_TEXT.galleryOff);
      finish(null);
    }
  };

  const sheet = (
    <ConfirmSheet
      visible={open}
      stacked
      destructive={false}
      title={PHOTO_TEXT.title}
      message={PHOTO_TEXT.message}
      confirmLabel={PHOTO_TEXT.gallery}
      cancelLabel={PHOTO_TEXT.cancel}
      onConfirm={() => void pickFrom('library')}
      onCancel={() => finish(null)}>
      <Button title={PHOTO_TEXT.take} variant="ink" onPress={() => void pickFrom('camera')} />
    </ConfirmSheet>
  );
  return { choose, sheet };
}

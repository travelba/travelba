/** Photo native pour une pièce. Null si la personne annule. */
export async function captureDocumentPhoto(): Promise<File | null> {
  return capturePhoto(false);
}

/** Photo pour un message : appareil ou pellicule. Null si la personne annule. */
export async function pickMessagePhoto(): Promise<File | null> {
  return capturePhoto(true);
}

async function capturePhoto(library: boolean): Promise<File | null> {
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  try {
    const photo = await Camera.getPhoto({
      quality: library ? 85 : 90,
      allowEditing: false,
      correctOrientation: true,
      resultType: CameraResultType.Base64,
      source: library ? CameraSource.Prompt : CameraSource.Camera,
      width: 2000,
      promptLabelHeader: library ? "Photo" : "Document",
      promptLabelPhoto: "Choisir une photo",
      promptLabelPicture: "Prendre une photo",
      promptLabelCancel: "Annuler",
    });
    if (!photo.base64String) return null;
    const binary = atob(photo.base64String);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const png = photo.format === "png";
    const name = library ? (png ? "message.png" : "message.jpg") : png ? "document.png" : "document.jpg";
    return new File([bytes], name, { type: png ? "image/png" : "image/jpeg" });
  } catch {
    return null;
  }
}

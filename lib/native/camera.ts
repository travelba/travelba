/** Photo native pour une pièce. Null si la personne annule. */
export async function captureDocumentPhoto(): Promise<File | null> {
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      correctOrientation: true,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
      width: 2000,
      promptLabelHeader: "Document",
      promptLabelPicture: "Prendre une photo",
      promptLabelCancel: "Annuler",
    });
    if (!photo.base64String) return null;
    const binary = atob(photo.base64String);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const png = photo.format === "png";
    return new File([bytes], png ? "document.png" : "document.jpg", { type: png ? "image/png" : "image/jpeg" });
  } catch {
    return null;
  }
}

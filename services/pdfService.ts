
import { ParcelData } from '../types';

declare const pdfjsLib: any;

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/** Konwertuje PDF na listę obrazów base64 (zoptymalizowane pod kątem limitów API przy dużej liczbie stron) */
export const convertPdfToImages = async (file: File): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: string[] = [];

  // Zwiększamy limit do 50 stron, aby obsłużyć duże wypisy
  const pagesToProcess = Math.min(pdf.numPages, 50);

  for (let i = 1; i <= pagesToProcess; i++) {
    const page = await pdf.getPage(i);
    // Skala 1.8 jest wystarczająca dla OCR, a pozwala wysłać więcej stron w jednym zapytaniu bez błędu XHR
    const viewport = page.getViewport({ scale: 1.8 }); 
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (context) {
      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);
      
      await page.render({ canvasContext: context, viewport }).promise;
      // Jakość 0.75 dla optymalizacji transferu przy wielu stronach
      const base64Image = canvas.toDataURL('image/jpeg', 0.75).split(',')[1];
      images.push(base64Image);
    }
  }

  return images;
};

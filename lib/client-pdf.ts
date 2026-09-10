import * as pdfjsLib from 'pdfjs-dist';

// Configure worker src in browser context
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  // Use official Cloudflare CDN worker matching the installed version
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true,
    });
    
    const doc = await loadingTask.promise;
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const strings = content.items
        .map((item) => ('str' in item ? (item as { str: string }).str : ''))
        .filter((str) => str.trim().length > 0);
      
      pageTexts.push(strings.join(' '));
    }

    const fullText = pageTexts.join('\n\n').trim();
    return fullText;
  } catch (error) {
    console.warn('Client-side PDF parsing error:', error);
    throw new Error(
      error instanceof Error
        ? `Failed to read PDF text: ${error.message}`
        : 'Failed to read text from the uploaded PDF.',
    );
  }
}

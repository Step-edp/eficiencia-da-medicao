import fs from 'fs'
import {
  extractInspectionPdfText,
  classifyInspectionDocument,
  parseInspectionText,
} from '../server/inspection-document-parser.ts'

const pdfPath = process.argv[2]
if (!pdfPath) {
  console.error('Usage: npx tsx scripts/debug-pdf.mjs <path-to-pdf>')
  process.exit(1)
}

const buf = fs.readFileSync(pdfPath)
const text = await extractInspectionPdfText(buf)
console.log('LENGTH', text.length)
console.log('CLASS', classifyInspectionDocument(text))
console.log('PARSED', JSON.stringify(parseInspectionText(text), null, 2))
console.log('SAMPLE', text.slice(0, 500))

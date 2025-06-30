# Curriculum JSON to SQL Converter

A Next.js TypeScript web application that converts curriculum JSON files into SQL INSERT statements for Supabase database integration.

## Features

- 🔧 **Auto-fixing**: Automatically parses JSON strings in arrays
- 📊 **Nested Structure Support**: Handles data nested under 'data' field
- ✅ **Real-time Validation**: JSON validation with 500ms debounce
- 📋 **Copy to Clipboard**: Easy copying of generated SQL
- 📁 **File Upload**: Upload JSON files directly
- 🎯 **Sample Data**: Load sample curriculum data
- ⚠️ **Error Handling**: Comprehensive error messages and warnings

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd curriculum-converter
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Run the development server:
```bash
npm run dev
# or
yarn dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment to Vercel

### Method 1: Deploy from GitHub (Recommended)

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/curriculum-converter.git
   git push -u origin main
   ```

2. **Connect to Vercel:**
   - Go to [vercel.com](https://vercel.com) and sign up/login
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will automatically detect it's a Next.js project
   - Click "Deploy"

3. **Environment Variables (if needed):**
   - In Vercel dashboard, go to Project Settings > Environment Variables
   - Add any required environment variables

### Method 2: Deploy with Vercel CLI

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Deploy:**
   ```bash
   vercel
   ```

3. **Follow the prompts** to configure your deployment.

## Project Structure

```
src/
├── app/
│   ├── globals.css          # Global styles with Tailwind
│   ├── layout.tsx           # Root layout component
│   └── page.tsx             # Home page
├── components/
│   └── CurriculumConverter.tsx # Main converter component
```

## Supported JSON Formats

### Nested Structure (Preferred)
```json
{
  "run_id": "...",
  "data": {
    "educational_level": "Primary 2",
    "alternative_names": ["Basic 2"],
    "subjects": [...]
  }
}
```

### Direct Structure
```json
{
  "educational_level": "Primary 2", 
  "alternative_names": ["Basic 2"],
  "subjects": [...]
}
```

### JSON Strings in Arrays (Auto-parsed)
The converter automatically handles JSON strings in:
- `term_1_weeks`, `term_2_weeks`, `term_3_weeks` arrays
- `recommended_books` arrays

## Configuration

### Tailwind CSS
The project uses Tailwind CSS for styling. Configuration is in `tailwind.config.js`.

### TypeScript
TypeScript configuration is in `tsconfig.json` with path aliases set up:
- `@/*` -> `./src/*`
- `@/components/*` -> `./src/components/*`

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

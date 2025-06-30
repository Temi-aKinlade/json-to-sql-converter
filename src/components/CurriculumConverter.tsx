"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";

// Types
interface CurriculumData {
  subject: string;
  grade: string;
  topics: Array<{
    name: string;
    description: string;
    objectives: string[];
  }>;
}

interface WeekData {
  week_number: number;
  topic: string | null;
  breakdown: string | null;
  note: string | null;
}

interface BookData {
  title: string;
  author: string;
  isbn: string;
}

interface SubjectData {
  subject_name: string;
  introduction: string;
  term_1_weeks: WeekData[];
  term_2_weeks: WeekData[];
  term_3_weeks: WeekData[];
  recommended_books: BookData[];
  weeks?: WeekData[];
}

interface EducationalLevelData {
  educational_level: string;
  alternative_names: string[];
  subjects: SubjectData[];
}

type ProcessingStatus = 'idle' | 'processing' | 'success' | 'error';

// Constants
const SAMPLE_JSON = {
  "run_id": "sample-run-id",
  "data": {
    "educational_level": "Primary 2",
    "alternative_names": ["Basic 2", "Pry 2"],
    "subjects": [
      {
        "subject_name": "English Studies",
        "introduction": "English Studies for Primary 2 focuses on developing foundational language skills including phonics, vocabulary, reading comprehension, and basic writing skills.",
        "term_1_weeks": [
          "{\"week_number\":1,\"topic\":\"Phonics: /a/, /e/, /i/, /o/, /u/ Phonemes\",\"breakdown\":\"Introduction to vowel sounds and basic pronunciation\",\"note\":\"Focus on proper pronunciation and recognition\"}",
          "{\"week_number\":2,\"topic\":\"Listening and telling a story; Phonics\",\"breakdown\":\"Story comprehension and phonics practice\",\"note\":\"Interactive storytelling sessions\"}"
        ],
        "term_2_weeks": [
          "{\"week_number\":1,\"topic\":\"Reading comprehension\",\"breakdown\":\"Understanding simple texts and answering questions\",\"note\":\"Use age-appropriate books\"}"
        ],
        "term_3_weeks": [
          "{\"week_number\":1,\"topic\":\"Creative writing\",\"breakdown\":\"Writing short stories and descriptions\",\"note\":\"Encourage creativity and imagination\"}"
        ],
        "recommended_books": [
          "{\"title\":\"Primary English Workbook 2\",\"author\":\"Educational Publishers\",\"isbn\":\"978-123456789\"}",
          "{\"title\":\"Phonics Fun for Kids\",\"author\":\"Learning Press\",\"isbn\":\"978-987654321\"}"
        ]
      }
    ]
  },
  "extraction_metadata": {
    "usage": {
      "num_pages_extracted": 5,
      "num_output_tokens": 1500
    }
  }
};

// Utility Functions
const escapeSQL = (str: string): string => {
  if (typeof str !== 'string') return String(str);
  return str.replace(/'/g, "''").replace(/\\/g, "\\\\");
};

const sanitizeString = (str: string): string => {
  if (typeof str !== 'string') return String(str);
  return str.replace(/\n/g, " ").trim();
};

const isValidWeekData = (week: unknown): boolean => {
  return (
    typeof week === 'object' && 
    week !== null && 
    'week_number' in week && 
    typeof (week as any).week_number === 'number'
  );
};

const parseWeekData = (weekData: unknown): WeekData | null => {
  try {
    let week: any;

    if (typeof weekData === "string") {
      week = JSON.parse(weekData);
    } else {
      week = weekData;
    }

    if (!isValidWeekData(week)) {
      console.warn(`Invalid week data structure:`, weekData);
      return null;
    }

    // Handle breakdown field - it can be a string or array
    let breakdown = week.breakdown;
    if (Array.isArray(breakdown)) {
      breakdown = breakdown.join(', ');
    } else if (breakdown && typeof breakdown !== 'string') {
      breakdown = String(breakdown);
    }

    return {
      week_number: week.week_number,
      topic: week.topic || null,
      breakdown: breakdown || week.objectives || null,
      note: week.note || null,
    };
  } catch (error) {
    console.warn(`Failed to parse week data:`, weekData, error);
    return null;
  }
};

const fixRecommendedBooks = (books: unknown): BookData[] => {
  if (!Array.isArray(books)) return [];
  
  return books.map((book: unknown) => {
    if (typeof book === 'string' && book.startsWith('{') && book.endsWith('}')) {
      try {
        return JSON.parse(book) as BookData;
      } catch (error) {
        console.warn('Failed to parse recommended book JSON string:', book);
        return { title: book, author: 'Unknown', isbn: '' };
      }
    }
    if (typeof book === 'object' && book !== null) {
      const bookObj = book as any;
      return {
        title: bookObj.title || 'Unknown Title',
        author: bookObj.author || 'Unknown Author',
        isbn: bookObj.isbn || ''
      };
    }
    return { title: String(book), author: 'Unknown', isbn: '' };
  });
};

export default function CurriculumConverter() {
  const [jsonInput, setJsonInput] = useState("");
  const [sqlOutput, setSqlOutput] = useState("");
  const [verificationQuery, setVerificationQuery] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('idle');
  const [formatWarnings, setFormatWarnings] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout>();
  const validationTimeoutRef = useRef<NodeJS.Timeout>();

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

  // Extract curriculum data from nested structures
  const extractCurriculumData = useCallback((data: any): EducationalLevelData | null => {
    // Handle nested structure with 'data' field
    if (data.data && typeof data.data === 'object') {
      data = data.data;
    }
    
    // Check if this looks like curriculum data
    if (data.educational_level && data.subjects) {
      return data as EducationalLevelData;
    }
    
    return null;
  }, []);

  const detectFormatIssues = useCallback((data: unknown): string[] => {
    const warnings: string[] = [];
    
    // Extract actual curriculum data if nested
    let curriculumData = data;
    if (typeof data === 'object' && data !== null && 'data' in data) {
      curriculumData = (data as any).data;
      warnings.push(`ℹ️ Detected nested structure - extracting curriculum data from 'data' field`);
    }
    
    const checkForJsonStrings = (obj: unknown, path: string = '') => {
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          if (typeof item === 'string' && item.startsWith('{') && item.endsWith('}')) {
            // Check if this is in a terms weeks array
            if (path.includes('term_') && path.includes('weeks')) {
              warnings.push(`🔧 Auto-fixing: ${path}[${index}] JSON string will be parsed to object`);
            } else if (path.includes('recommended_books')) {
              warnings.push(`🔧 Auto-fixing: ${path}[${index}] JSON string will be parsed to book object`);
            } else {
              warnings.push(`⚠️ JSON string at ${path}[${index}] - will be parsed automatically`);
            }
          } else if (typeof item === 'object' && item !== null) {
            checkForJsonStrings(item, `${path}[${index}]`);
          }
        });
      } else if (typeof obj === 'object' && obj !== null) {
        Object.keys(obj).forEach(key => {
          const newPath = path ? `${path}.${key}` : key;
          const value = (obj as any)[key];
          checkForJsonStrings(value, newPath);
        });
      }
    };
    
    checkForJsonStrings(curriculumData);
    return warnings;
  }, []);

  const processTermWeeks = useCallback((subject: SubjectData, termKey: keyof SubjectData): WeekData[] => {
    const termData = subject[termKey];
    if (!Array.isArray(termData)) {
      return [];
    }

    return termData
      .map((weekItem: any) => {
        // Handle JSON strings in the array
        if (typeof weekItem === 'string' && weekItem.startsWith('{') && weekItem.endsWith('}')) {
          try {
            return parseWeekData(JSON.parse(weekItem));
          } catch (error) {
            console.warn('Failed to parse week JSON string:', weekItem);
            return null;
          }
        }
        return parseWeekData(weekItem);
      })
      .filter((week): week is WeekData => week !== null);
  }, []);

  const generateEducationalLevelSQL = useCallback((curriculum: EducationalLevelData): { sql: string[], verification: string[] } => {
    const educationalLevel = curriculum.educational_level;
    const alternativeNames = curriculum.alternative_names || [];
    const sqlStatements: string[] = [];
    const verificationStatements: string[] = [];

    // Add header
    sqlStatements.push(
      "-- =====================================================",
      `-- ${educationalLevel.toUpperCase()} CURRICULUM DATA - SQL INSERT STATEMENTS`,
      "-- =====================================================",
      "-- Copy and paste this entire script into Supabase SQL Editor",
      `-- and click \"RUN\" to insert the ${educationalLevel} curriculum data`,
      "-- =====================================================",
      "",
    );

    curriculum.subjects.forEach((subject: SubjectData, subjectIndex: number) => {
      if (!subject.subject_name) {
        throw new Error(`Subject at index ${subjectIndex} is missing 'subject_name' field.`);
      }

      const subjectName = subject.subject_name;
      const introduction = subject.introduction || "";
      const recommendedBooks = fixRecommendedBooks(subject.recommended_books || []);

      const term1Weeks = processTermWeeks(subject, "term_1_weeks");
      const term2Weeks = processTermWeeks(subject, "term_2_weeks");
      const term3Weeks = processTermWeeks(subject, "term_3_weeks");

      // Handle legacy 'weeks' format for backward compatibility
      if (subject.weeks && Array.isArray(subject.weeks) && term1Weeks.length === 0) {
        const legacyWeeks = subject.weeks.map(parseWeekData).filter((week): week is WeekData => week !== null);
        term1Weeks.push(...legacyWeeks);
      }

      // Generate the INSERT statement
      sqlStatements.push(
        `-- Insert ${educationalLevel} ${subjectName} curriculum`,
        "INSERT INTO curriculum_data (",
        "    educational_level,",
        "    subject_name,",
        "    alternative_names,",
        "    introduction,",
        "    term_1_weeks,",
        "    term_2_weeks,",
        "    term_3_weeks,",
        "    recommended_books",
        ") VALUES (",
        `    '${escapeSQL(educationalLevel)}',`,
        `    '${escapeSQL(subjectName)}',`,
        `    '${escapeSQL(JSON.stringify(alternativeNames))}'::jsonb,`,
        `    '${escapeSQL(sanitizeString(introduction))}',`,
        `    '${escapeSQL(JSON.stringify(term1Weeks, null, 8))}'::jsonb,`,
        `    '${escapeSQL(JSON.stringify(term2Weeks, null, 8))}'::jsonb,`,
        `    '${escapeSQL(JSON.stringify(term3Weeks, null, 8))}'::jsonb,`,
        `    '${escapeSQL(JSON.stringify(recommendedBooks))}'::jsonb`,
        ")",
        "ON CONFLICT (educational_level, subject_name)",
        "DO UPDATE SET",
        "    alternative_names = EXCLUDED.alternative_names,",
        "    introduction = EXCLUDED.introduction,",
        "    term_1_weeks = EXCLUDED.term_1_weeks,",
        "    term_2_weeks = EXCLUDED.term_2_weeks,",
        "    term_3_weeks = EXCLUDED.term_3_weeks,",
        "    recommended_books = EXCLUDED.recommended_books,",
        "    updated_at = NOW();",
        "",
      );
    });

    // Add verification queries
    verificationStatements.push(
      "-- =====================================================",
      "-- VERIFICATION QUERY",
      "-- =====================================================",
      "-- Run this to confirm the data was inserted correctly",
      "",
      "-- Check for your specific educational level",
      "SELECT",
      "    id,",
      "    educational_level,",
      "    subject_name,",
      "    LENGTH(introduction) as intro_length,",
      "    jsonb_array_length(term_1_weeks) as term1_weeks_count,",
      "    jsonb_array_length(term_2_weeks) as term2_weeks_count,",
      "    jsonb_array_length(term_3_weeks) as term3_weeks_count,",
      "    jsonb_array_length(recommended_books) as books_count,",
      "    created_at,",
      "    updated_at",
      "FROM curriculum_data",
      `WHERE educational_level = '${escapeSQL(educationalLevel)}'`,
      "ORDER BY subject_name;",
    );

    return { sql: sqlStatements, verification: verificationStatements };
  }, [processTermWeeks]);

  const generateSQL = useCallback((data: unknown) => {
    setProcessingStatus('processing');

    try {
      if (!data) {
        throw new Error("No data provided");
      }

      const dataArray = Array.isArray(data) ? data : [data];
      let allSqlStatements: string[] = [];
      let allVerificationStatements: string[] = [];

      dataArray.forEach((item, index) => {
        if (typeof item !== "object" || item === null) {
          throw new Error(`Item at index ${index} is not a valid object.`);
        }

        // Extract curriculum data from nested structures
        const curriculum = extractCurriculumData(item);
        
        if (!curriculum) {
          throw new Error(`Could not extract curriculum data from item at index ${index}. Expected structure with 'educational_level' and 'subjects' fields, or nested under 'data' field.`);
        }

        const { sql, verification } = generateEducationalLevelSQL(curriculum);
        allSqlStatements.push(...sql);
        allVerificationStatements.push(...verification);
      });

      setSqlOutput(allSqlStatements.join("\n"));
      setVerificationQuery(allVerificationStatements.join("\n"));
      setProcessingStatus('success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setJsonError(`Conversion error: ${errorMessage}`);
      setSqlOutput("");
      setVerificationQuery("");
      setProcessingStatus('error');
    }
  }, [generateEducationalLevelSQL, extractCurriculumData]);

  const validateAndConvertJson = useCallback((input: string) => {
    if (!input.trim()) {
      setJsonError("");
      setSqlOutput("");
      setVerificationQuery("");
      setFormatWarnings([]);
      setProcessingStatus('idle');
      return;
    }

    try {
      const parsed = JSON.parse(input);
      setJsonError("");
      
      // Check for common format issues before conversion
      const warnings = detectFormatIssues(parsed);
      setFormatWarnings(warnings);
      
      generateSQL(parsed);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setJsonError(`Invalid JSON: ${errorMessage}`);
      setSqlOutput("");
      setVerificationQuery("");
      setProcessingStatus('error');
    }
  }, [detectFormatIssues, generateSQL]);

  const handleJsonChange = useCallback((value: string) => {
    setJsonInput(value);
    
    // Clear previous timeout
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    
    // Debounce validation for better performance
    validationTimeoutRef.current = setTimeout(() => {
      validateAndConvertJson(value);
    }, 500);
  }, [validateAndConvertJson]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      
      copyTimeoutRef.current = setTimeout(() => {
        setCopySuccess(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  }, []);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    
    if (!file.name.endsWith('.json')) {
      setJsonError("Please select a valid JSON file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setJsonError("File size too large. Please select a file smaller than 10MB");
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setJsonInput(content);
        validateAndConvertJson(content);
      }
    };

    reader.onerror = () => {
      setJsonError("Failed to read file");
    };

    reader.readAsText(file);
  }, [validateAndConvertJson]);

  const clearAll = useCallback(() => {
    setJsonInput("");
    setSqlOutput("");
    setVerificationQuery("");
    setJsonError("");
    setFormatWarnings([]);
    setCopySuccess(false);
    setProcessingStatus('idle');
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const loadSample = useCallback(() => {
    const sampleJson = JSON.stringify(SAMPLE_JSON, null, 2);
    setJsonInput(sampleJson);
    validateAndConvertJson(sampleJson);
  }, [validateAndConvertJson]);

  const isInputValid = useMemo(() => jsonInput.trim() && !jsonError, [jsonInput, jsonError]);
  const showProcessing = processingStatus === 'processing';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">🗄</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              Curriculum JSON to SQL Converter
            </h1>
          </div>
          <p className="text-gray-600 max-w-2xl text-sm md:text-base">
            Convert curriculum JSON files into SQL INSERT statements for Supabase database integration.
          </p>

          <div className="flex gap-2 mt-4 flex-wrap">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              📁 Upload JSON
            </button>
            <button
              onClick={loadSample}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              📄 Load Sample
            </button>
            <button
              onClick={clearAll}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              🗑 Clear All
            </button>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              ❓ Help
            </button>
          </div>
        </div>
      </div>

      {/* Help Section */}
      {showHelp && (
        <div className="bg-yellow-50 border-b">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h3 className="font-semibold mb-2 text-red-700">🚨 Common Issues:</h3>
                <ul className="space-y-1 text-gray-600">
                  <li>• JSON strings in arrays (auto-fixed)</li>
                  <li>• Nested structure with &apos;data&apos; field (handled automatically)</li>
                  <li>• Missing required fields: educational_level, subjects</li>
                  <li>• Malformed week or book data</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-2 text-green-700">✅ Supported Formats:</h3>
                <ul className="space-y-1 text-gray-600">
                  <li>• Nested: &#123;&quot;data&quot;: &#123;&quot;educational_level&quot;: ...&#125;&#125;</li>
                  <li>• Direct: &#123;&quot;educational_level&quot;: ...&#125;</li>
                  <li>• JSON strings in term weeks (auto-parsed)</li>
                  <li>• JSON strings in recommended_books (auto-parsed)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[700px]">
          {/* JSON Input Panel */}
          <div className="bg-white rounded-lg border shadow-sm flex flex-col">
            <div className="p-4 border-b flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                📝 JSON Input
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Paste your curriculum JSON data here. Validation happens automatically with 500ms delay.
              </p>
            </div>
            <div className="p-4 flex-1 flex flex-col gap-3 min-h-[500px]">
              {jsonError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <span className="text-red-400">⚠️</span>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">
                        JSON Validation Error
                      </h3>
                      <div className="mt-2 text-sm text-red-700 whitespace-pre-wrap">
                        {jsonError}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {formatWarnings.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <span className="text-orange-400">⚠️</span>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-orange-800">
                        Format Issues Detected
                      </h3>
                      <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                        {formatWarnings.map((warning, index) => (
                          <div key={index} className="text-xs font-mono bg-orange-100 p-1 rounded text-orange-700">
                            {warning}
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-sm text-orange-700">
                        <strong>Auto-fix enabled:</strong> The converter will attempt to fix these issues automatically.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-1 min-h-[400px]">
                <textarea
                  placeholder="Paste your curriculum JSON here..."
                  value={jsonInput}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  className="w-full h-full min-h-[400px] font-mono text-sm border border-gray-300 rounded-md p-3 resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* SQL Output Panel */}
          <div className="bg-white rounded-lg border shadow-sm flex flex-col">
            <div className="p-4 border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    🗄 SQL Output
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Generated SQL INSERT statements ready for Supabase.
                  </p>
                </div>

                {sqlOutput && (
                  <button
                    onClick={() => copyToClipboard(sqlOutput)}
                    disabled={!sqlOutput}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {copySuccess ? "✅ Copied!" : "📋 Copy SQL"}
                  </button>
                )}
              </div>
            </div>
            <div className="p-4 flex-1 min-h-[500px] flex flex-col">
              {showProcessing ? (
                <div className="flex items-center justify-center flex-1 text-gray-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-2">Processing...</span>
                </div>
              ) : sqlOutput ? (
                <textarea
                  value={sqlOutput}
                  readOnly
                  className="w-full flex-1 min-h-[400px] font-mono text-sm border border-gray-300 rounded-md p-3 resize-none bg-gray-50"
                  placeholder="SQL statements will appear here..."
                />
              ) : (
                <div className="flex items-center justify-center flex-1 text-gray-500">
                  <div className="text-center">
                    <div className="text-4xl mb-4">🗄️</div>
                    <p className="text-lg mb-2">
                      SQL statements will appear here once you input valid JSON
                    </p>
                    <p className="text-sm">
                      Supports nested JSON with &apos;data&apos; field and JSON strings in arrays
                    </p>
                    <p className="text-xs mt-2 text-gray-400">
                      💡 Auto-parsing enabled for JSON strings in term weeks and recommended books
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleFileUpload}
        className="hidden"
        aria-label="Upload JSON file"
      />
    </div>
  );
}

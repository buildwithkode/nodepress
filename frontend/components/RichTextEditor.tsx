'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Link2, Undo, Redo,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Quote, Code, Code2, Minus, ImageIcon, Eye, Code as CodeIcon,
  Maximize2, Minimize2, RemoveFormatting, Clock, FileText,
  UploadCloud, Loader2,
} from 'lucide-react';
import Cookies from 'js-cookie';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { EditorMediaModal } from './EditorMediaModal';
import { EditorLinkModal } from './EditorLinkModal';

interface Props {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
}

const ToolbarButton = ({
  onClick, active, disabled, icon, title,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  title: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={cn(
      'p-1.5 rounded-md text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
      active
        ? 'bg-primary/15 text-primary font-semibold'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
    )}
  >
    {icon}
  </button>
);

const ToolbarDivider = () => (
  <div className="w-px h-5 bg-border/60 mx-1 shrink-0" />
);

export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const [mode, setMode] = useState<'visual' | 'html'>('visual');
  const [htmlValue, setHtmlValue] = useState(value || '');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Modals state
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  // Stats state
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  // Desktop canvas drop state
  const [isCanvasDragging, setIsCanvasDragging] = useState(false);
  const [canvasUploading, setCanvasUploading] = useState(false);

  const switchingRef = useRef(false);

  const handleCanvasDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsCanvasDragging(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) return;

    setCanvasUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = Cookies.get('np_token') || '';
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      const targetUrl = data.url || data.webpUrl;
      editor?.chain().focus().setImage({ src: targetUrl, alt: file.name.replace(/\.[^/.]+$/, '') }).run();
      toast.success('Image uploaded and embedded into content');
    } catch {
      toast.error('Failed to upload dropped image');
    } finally {
      setCanvasUploading(false);
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'tiptap-link',
        },
      }),
      Placeholder.configure({ placeholder: placeholder || 'Write your editorial story here…' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: 'tiptap-image',
        },
      }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      if (switchingRef.current) return;
      const html = editor.getHTML();
      setHtmlValue(html);
      onChange?.(html);

      // Update metrics
      const text = editor.getText();
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      setWordCount(words);
      setCharCount(text.length);
    },
    editorProps: {
      attributes: {
        class: 'tiptap-content prose dark:prose-invert max-w-none focus:outline-none',
        style: 'min-height: 240px; padding: 16px; outline: none; font-size: 14px; line-height: 1.8;',
      },
    },
  });

  // Calculate initial metrics on load
  useEffect(() => {
    if (editor) {
      const text = editor.getText();
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      setWordCount(words);
      setCharCount(text.length);
    }
  }, [editor]);

  // Sync external value
  useEffect(() => {
    if (!editor) return;
    if (value !== undefined && editor.getHTML() !== value) {
      editor.commands.setContent(value || '');
      setHtmlValue(value || '');
      const text = editor.getText();
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      setWordCount(words);
      setCharCount(text.length);
    }
  }, [value]);

  // Close fullscreen on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const switchToHtml = () => {
    if (!editor) return;
    switchingRef.current = true;
    const html = editor.getHTML();
    setHtmlValue(html);
    setMode('html');
    switchingRef.current = false;
  };

  const switchToVisual = () => {
    if (!editor) return;
    switchingRef.current = true;
    editor.commands.setContent(htmlValue || '');
    onChange?.(htmlValue || '');
    setMode('visual');
    switchingRef.current = false;
  };

  // Image insertion handler from Media Modal
  const handleInsertImage = ({ url, alt, caption }: { url: string; alt: string; caption?: string }) => {
    if (!editor) return;
    editor.chain().focus().setImage({
      src: url,
      alt: alt || undefined,
      title: caption || undefined,
    }).run();
    toast.success('Image inserted into content');
  };

  // Link save handler from Link Modal
  const handleSaveLink = ({
    url,
    text,
    newTab,
    noFollow,
  }: {
    url: string;
    text?: string;
    newTab: boolean;
    noFollow: boolean;
  }) => {
    if (!editor) return;
    const relParts: string[] = [];
    if (newTab) relParts.push('noopener', 'noreferrer');
    if (noFollow) relParts.push('nofollow');
    const rel = relParts.length > 0 ? relParts.join(' ') : undefined;
    const target = newTab ? '_blank' : undefined;

    if (text && editor.state.selection.empty) {
      editor.chain().focus().insertContent(
        `<a href="${url}" target="${target || ''}" rel="${rel || ''}">${text}</a>`
      ).run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({
        href: url,
        target,
        rel,
      }).run();
    }
    toast.success('Hyperlink applied');
  };

  const handleRemoveLink = () => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    toast.info('Hyperlink removed');
  };

  if (!editor) return null;

  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <div
      className={cn(
        'border border-input rounded-lg overflow-hidden transition-all bg-background focus-within:ring-1 focus-within:ring-ring flex flex-col',
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none border-none shadow-2xl h-screen max-h-screen'
          : 'relative min-h-[360px]'
      )}
    >
      {/* ── Top Header / Tab Bar ── */}
      <div className="bg-muted/40 border-b border-border flex items-center justify-between px-3 pt-2">
        {/* Visual vs HTML Mode Tabs */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={switchToVisual}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-md border-b-2 transition-colors',
              mode === 'visual'
                ? 'border-primary text-primary bg-background shadow-xs'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Eye className="h-3.5 w-3.5" /> Visual Editor
          </button>
          <button
            type="button"
            onClick={switchToHtml}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-md border-b-2 transition-colors',
              mode === 'html'
                ? 'border-primary text-primary bg-background shadow-xs'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <CodeIcon className="h-3.5 w-3.5" /> HTML Source
          </button>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-1 pb-1">
          <ToolbarButton
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Zen / Fullscreen Writing Mode'}
            icon={isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            active={isFullscreen}
            onClick={() => setIsFullscreen(!isFullscreen)}
          />
        </div>
      </div>

      {/* ── Toolbar (Visual Mode Only) ── */}
      {mode === 'visual' && (
        <div className="bg-muted/20 border-b border-border/80 px-2.5 py-1.5 flex items-center flex-wrap gap-0.5 sticky top-0 z-10 backdrop-blur-xs">
          {/* Headings */}
          {([1, 2, 3] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
              title={`Heading ${level}`}
              className={cn(
                'px-2 py-1 rounded-md text-xs font-bold transition-colors',
                editor.isActive('heading', { level })
                  ? 'bg-primary/15 text-primary font-black'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              H{level}
            </button>
          ))}

          <ToolbarDivider />

          {/* Text Formatting */}
          <ToolbarButton
            title="Bold (Ctrl+B)"
            icon={<Bold className="h-4 w-4" />}
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            title="Italic (Ctrl+I)"
            icon={<Italic className="h-4 w-4" />}
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            title="Underline (Ctrl+U)"
            icon={<UnderlineIcon className="h-4 w-4" />}
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
          <ToolbarButton
            title="Strikethrough"
            icon={<Strikethrough className="h-4 w-4" />}
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          />
          <ToolbarButton
            title="Inline code"
            icon={<Code className="h-4 w-4" />}
            active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()}
          />
          <ToolbarButton
            title="Clear formatting"
            icon={<RemoveFormatting className="h-4 w-4" />}
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          />

          <ToolbarDivider />

          {/* Alignment */}
          <ToolbarButton
            title="Align left"
            icon={<AlignLeft className="h-4 w-4" />}
            active={editor.isActive({ textAlign: 'left' })}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
          />
          <ToolbarButton
            title="Align center"
            icon={<AlignCenter className="h-4 w-4" />}
            active={editor.isActive({ textAlign: 'center' })}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
          />
          <ToolbarButton
            title="Align right"
            icon={<AlignRight className="h-4 w-4" />}
            active={editor.isActive({ textAlign: 'right' })}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
          />
          <ToolbarButton
            title="Justify"
            icon={<AlignJustify className="h-4 w-4" />}
            active={editor.isActive({ textAlign: 'justify' })}
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          />

          <ToolbarDivider />

          {/* Lists & Quotes */}
          <ToolbarButton
            title="Bullet list"
            icon={<List className="h-4 w-4" />}
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            title="Numbered list"
            icon={<ListOrdered className="h-4 w-4" />}
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <ToolbarButton
            title="Blockquote"
            icon={<Quote className="h-4 w-4" />}
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
          <ToolbarButton
            title="Code block"
            icon={<Code2 className="h-4 w-4" />}
            active={editor.isActive('codeBlock')}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          />
          <ToolbarButton
            title="Horizontal divider"
            icon={<Minus className="h-4 w-4" />}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          />

          <ToolbarDivider />

          {/* Link & Media — Upgraded Dialogs */}
          <ToolbarButton
            title={editor.isActive('link') ? 'Edit link' : 'Insert hyperlink'}
            icon={<Link2 className="h-4 w-4" />}
            active={editor.isActive('link')}
            onClick={() => setLinkModalOpen(true)}
          />
          <ToolbarButton
            title="Insert media image (Library, Upload, URL)"
            icon={<ImageIcon className="h-4 w-4" />}
            onClick={() => setMediaModalOpen(true)}
          />

          <ToolbarDivider />

          {/* Undo / Redo */}
          <ToolbarButton
            title="Undo (Ctrl+Z)"
            icon={<Undo className="h-4 w-4" />}
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          />
          <ToolbarButton
            title="Redo (Ctrl+Y)"
            icon={<Redo className="h-4 w-4" />}
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          />
        </div>
      )}

      {/* ── Editor Canvas Area ── */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsCanvasDragging(true);
        }}
        onDragLeave={() => setIsCanvasDragging(false)}
        onDrop={handleCanvasDrop}
        className={cn(
          'relative flex-1 overflow-y-auto transition-colors',
          isFullscreen && 'px-6 py-4',
          isCanvasDragging && 'bg-primary/5 ring-2 ring-primary/40 ring-inset'
        )}
      >
        {isCanvasDragging && (
          <div className="absolute inset-0 z-20 pointer-events-none flex flex-col items-center justify-center bg-background/80 backdrop-blur-xs border-2 border-dashed border-primary">
            <UploadCloud className="h-8 w-8 text-primary animate-bounce mb-2" />
            <p className="text-xs font-semibold text-foreground">Drop image file to insert inline</p>
          </div>
        )}
        {canvasUploading && (
          <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center bg-background/70 backdrop-blur-xs">
            <div className="flex items-center gap-2 text-xs font-semibold bg-card px-4 py-2 rounded-xl shadow-lg border border-border">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Uploading image…
            </div>
          </div>
        )}
        <div className={cn(isFullscreen && 'max-w-4xl mx-auto')}>
          {mode === 'visual' ? (
            <EditorContent editor={editor} />
          ) : (
            <textarea
              value={htmlValue}
              onChange={(e) => {
                setHtmlValue(e.target.value);
                onChange?.(e.target.value);
              }}
              spellCheck={false}
              className="w-full min-h-[300px] p-4 font-mono text-xs bg-muted/10 text-foreground resize-y outline-none leading-relaxed border-0"
              placeholder="<p>Enter HTML markup here…</p>"
            />
          )}
        </div>
      </div>

      {/* ── Editor Status Bar (Real-Time Metrics) ── */}
      <div className="bg-muted/30 border-t border-border px-3 py-1.5 flex items-center justify-between text-[11px] text-muted-foreground select-none">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 font-medium">
            <FileText className="h-3 w-3" />
            <strong className="text-foreground">{wordCount}</strong> {wordCount === 1 ? 'word' : 'words'}
          </span>
          <span>
            <strong className="text-foreground">{charCount}</strong> characters
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            ~{readingTimeMinutes} min read
          </span>
        </div>

        <div className="flex items-center gap-3">
          {isFullscreen && (
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded border border-border/50">
              Press Esc to exit zen mode
            </span>
          )}
          <span className="font-mono text-[10px] text-muted-foreground/70">
            NodePress WYSIWYG Editor
          </span>
        </div>
      </div>

      {/* ── Integrated Media Modal ── */}
      <EditorMediaModal
        open={mediaModalOpen}
        onClose={() => setMediaModalOpen(false)}
        onInsert={handleInsertImage}
      />

      {/* ── Integrated Link Modal ── */}
      <EditorLinkModal
        open={linkModalOpen}
        initialUrl={editor.getAttributes('link').href || ''}
        initialNewTab={editor.getAttributes('link').target === '_blank'}
        initialNoFollow={editor.getAttributes('link').rel?.includes('nofollow') ?? false}
        hasLink={editor.isActive('link')}
        onClose={() => setLinkModalOpen(false)}
        onSave={handleSaveLink}
        onRemove={handleRemoveLink}
      />
    </div>
  );
}

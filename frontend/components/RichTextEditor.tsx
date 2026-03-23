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
  AlignLeft, AlignCenter, AlignRight,
  Quote, Code, Code2, Minus, ImageIcon, Eye, Code as CodeIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';

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
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
    )}
  >
    {icon}
  </button>
);

const ToolbarDivider = () => (
  <div className="w-px h-5 bg-border mx-1 shrink-0" />
);

export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const [mode, setMode] = useState<'visual' | 'html'>('visual');
  const [htmlValue, setHtmlValue] = useState(value || '');
  const switchingRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder || 'Write your content here…' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ inline: false }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      if (switchingRef.current) return;
      const html = editor.getHTML();
      setHtmlValue(html);
      onChange?.(html);
    },
    editorProps: {
      attributes: {
        class: 'tiptap-content',
        style: 'min-height: 200px; padding: 12px; outline: none; font-size: 14px; line-height: 1.8;',
      },
    },
  });

  // Sync external value (e.g. editing existing entry)
  useEffect(() => {
    if (!editor) return;
    if (value !== undefined && editor.getHTML() !== value) {
      editor.commands.setContent(value || '');
      setHtmlValue(value || '');
    }
  }, [value]);

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

  const setLink = () => {
    if (!editor) return;
    const url = window.prompt('Enter URL:', editor.getAttributes('link').href || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  const insertImage = () => {
    if (!editor) return;
    const url = window.prompt('Enter image URL:');
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  if (!editor) return null;

  return (
    <div className="border border-input rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-ring">

      {/* Tab bar + toolbar */}
      <div className="bg-muted/40 border-b border-border">
        {/* Tabs */}
        <div className="flex items-center gap-1 px-2 pt-1.5">
          <button
            type="button"
            onClick={switchToVisual}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-t-md border-b-2 transition-colors',
              mode === 'visual'
                ? 'border-primary text-primary bg-background'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Eye className="h-3.5 w-3.5" /> Visual
          </button>
          <button
            type="button"
            onClick={switchToHtml}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-t-md border-b-2 transition-colors',
              mode === 'html'
                ? 'border-primary text-primary bg-background'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <CodeIcon className="h-3.5 w-3.5" /> HTML
          </button>
        </div>

        {/* Toolbar — only in visual mode */}
        {mode === 'visual' && (
          <div className="flex items-center flex-wrap gap-0.5 px-2 py-1.5">
            {/* Formatting */}
            <ToolbarButton title="Bold (Ctrl+B)" icon={<Bold className="h-4 w-4" />}
              active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
            <ToolbarButton title="Italic (Ctrl+I)" icon={<Italic className="h-4 w-4" />}
              active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
            <ToolbarButton title="Underline (Ctrl+U)" icon={<UnderlineIcon className="h-4 w-4" />}
              active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
            <ToolbarButton title="Strikethrough" icon={<Strikethrough className="h-4 w-4" />}
              active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
            <ToolbarButton title="Inline code" icon={<Code className="h-4 w-4" />}
              active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />

            <ToolbarDivider />

            {/* Headings */}
            {([1, 2, 3] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
                title={`Heading ${level}`}
                className={cn(
                  'p-1.5 rounded-md text-sm transition-colors min-w-[28px]',
                  editor.isActive('heading', { level })
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <span className="text-xs font-bold">H{level}</span>
              </button>
            ))}

            <ToolbarDivider />

            {/* Alignment */}
            <ToolbarButton title="Align left" icon={<AlignLeft className="h-4 w-4" />}
              active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
            <ToolbarButton title="Align center" icon={<AlignCenter className="h-4 w-4" />}
              active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
            <ToolbarButton title="Align right" icon={<AlignRight className="h-4 w-4" />}
              active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} />

            <ToolbarDivider />

            {/* Lists, Quote, Code block, HR */}
            <ToolbarButton title="Bullet list" icon={<List className="h-4 w-4" />}
              active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
            <ToolbarButton title="Numbered list" icon={<ListOrdered className="h-4 w-4" />}
              active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
            <ToolbarButton title="Blockquote" icon={<Quote className="h-4 w-4" />}
              active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
            <ToolbarButton title="Code block" icon={<Code2 className="h-4 w-4" />}
              active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
            <ToolbarButton title="Horizontal rule" icon={<Minus className="h-4 w-4" />}
              onClick={() => editor.chain().focus().setHorizontalRule().run()} />

            <ToolbarDivider />

            {/* Link & Image */}
            <ToolbarButton title="Insert link" icon={<Link2 className="h-4 w-4" />}
              active={editor.isActive('link')} onClick={setLink} />
            <ToolbarButton title="Insert image" icon={<ImageIcon className="h-4 w-4" />}
              onClick={insertImage} />

            <ToolbarDivider />

            {/* Undo / Redo */}
            <ToolbarButton title="Undo (Ctrl+Z)" icon={<Undo className="h-4 w-4" />}
              disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
            <ToolbarButton title="Redo (Ctrl+Y)" icon={<Redo className="h-4 w-4" />}
              disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
          </div>
        )}
      </div>

      {/* Editor area */}
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
          className="w-full min-h-[200px] p-3 font-mono text-xs bg-background text-foreground resize-y outline-none"
          placeholder="<p>Enter HTML here…</p>"
        />
      )}
    </div>
  );
}

'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Link2,
  Undo,
  Redo,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';

interface Props {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
}

const ToolbarButton = ({
  onClick,
  active,
  disabled,
  icon,
  title,
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
      'p-1.5 rounded text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
      active ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100',
    )}
  >
    {icon}
  </button>
);

const ToolbarDivider = () => <div className="w-px h-5 bg-gray-200 mx-1" />;

export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({
        placeholder: placeholder || 'Write your content here…',
      }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'tiptap-content',
        style:
          'min-height: 200px; padding: 12px; outline: none; font-size: 14px; line-height: 1.8;',
      },
    },
  });

  // Sync external value changes (e.g. when editing an existing entry)
  useEffect(() => {
    if (editor && value !== undefined && editor.getHTML() !== value) {
      editor.commands.setContent(value || '');
    }
  }, [value]);

  if (!editor) return null;

  const setLink = () => {
    const url = window.prompt('Enter URL:', editor.getAttributes('link').href || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  return (
    <div className="border border-input rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-ring">
      {/* Toolbar */}
      <div className="flex items-center flex-wrap gap-0.5 p-1.5 bg-gray-50 border-b border-gray-200">
        {/* Formatting */}
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

        <ToolbarDivider />

        {/* Headings */}
        {([1, 2, 3] as const).map((level) => (
          <button
            key={level}
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level }).run()
            }
            title={`Heading ${level}`}
            className={cn(
              'p-1.5 rounded text-sm transition-colors min-w-[28px]',
              editor.isActive('heading', { level })
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100',
            )}
          >
            <span className="text-xs font-bold">H{level}</span>
          </button>
        ))}

        <ToolbarDivider />

        {/* Lists & Link */}
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
          title="Insert link"
          icon={<Link2 className="h-4 w-4" />}
          active={editor.isActive('link')}
          onClick={setLink}
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

      {/* Editor area */}
      <EditorContent editor={editor} />
    </div>
  );
}

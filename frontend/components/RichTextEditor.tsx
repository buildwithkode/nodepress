'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Button, Space, Divider } from 'antd';
import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  OrderedListOutlined,
  UnorderedListOutlined,
  LinkOutlined,
  StrikethroughOutlined,
  UndoOutlined,
  RedoOutlined,
} from '@ant-design/icons';
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
  <Button
    size="small"
    type={active ? 'primary' : 'text'}
    icon={icon}
    onClick={onClick}
    disabled={disabled}
    title={title}
    style={{ minWidth: 28 }}
  />
);

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
    <div
      style={{
        border: '1px solid #d9d9d9',
        borderRadius: 6,
        overflow: 'hidden',
        transition: 'border-color 0.2s',
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = '#1677ff')}
      onBlur={(e) => (e.currentTarget.style.borderColor = '#d9d9d9')}
    >
      {/* Toolbar */}
      <div
        style={{
          padding: '6px 10px',
          background: '#fafafa',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Space size={2}>
          <ToolbarButton
            title="Bold (Ctrl+B)"
            icon={<BoldOutlined />}
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            title="Italic (Ctrl+I)"
            icon={<ItalicOutlined />}
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            title="Underline (Ctrl+U)"
            icon={<UnderlineOutlined />}
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
          <ToolbarButton
            title="Strikethrough"
            icon={<StrikethroughOutlined />}
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          />
        </Space>

        <Divider type="vertical" style={{ margin: '0 4px' }} />

        <Space size={2}>
          {[1, 2, 3].map((level) => (
            <Button
              key={level}
              size="small"
              type={editor.isActive('heading', { level }) ? 'primary' : 'text'}
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()
              }
              title={`Heading ${level}`}
              style={{ minWidth: 28, fontWeight: 700, fontSize: 11 }}
            >
              H{level}
            </Button>
          ))}
        </Space>

        <Divider type="vertical" style={{ margin: '0 4px' }} />

        <Space size={2}>
          <ToolbarButton
            title="Bullet list"
            icon={<UnorderedListOutlined />}
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            title="Numbered list"
            icon={<OrderedListOutlined />}
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <ToolbarButton
            title="Insert link"
            icon={<LinkOutlined />}
            active={editor.isActive('link')}
            onClick={setLink}
          />
        </Space>

        <Divider type="vertical" style={{ margin: '0 4px' }} />

        <Space size={2}>
          <ToolbarButton
            title="Undo (Ctrl+Z)"
            icon={<UndoOutlined />}
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          />
          <ToolbarButton
            title="Redo (Ctrl+Y)"
            icon={<RedoOutlined />}
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          />
        </Space>
      </div>

      {/* Editor area */}
      <EditorContent editor={editor} />
    </div>
  );
}

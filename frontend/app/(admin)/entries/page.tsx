'use client';

import {
  Typography,
  Button,
  Table,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Popconfirm,
  message,
  Empty,
  Tag,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FileOutlined,
} from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';
import api from '../../../lib/axios';
import DynamicFormField from './DynamicFormField';

function toSlug(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const { Title, Text } = Typography;

interface Field {
  name: string;
  type: string;
  options?: any;
}

interface ContentType {
  id: number;
  name: string;
  schema: Field[];
}

interface Entry {
  id: number;
  slug: string;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export default function EntriesPage() {
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [selectedCT, setSelectedCT] = useState<ContentType | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadingCT, setLoadingCT] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const slugManualRef = useRef(false); // true when user manually edited slug

  // Load content types on mount
  useEffect(() => {
    const fetchContentTypes = async () => {
      setLoadingCT(true);
      try {
        const res = await api.get('/content-types');
        setContentTypes(res.data);
      } catch {
        messageApi.error('Failed to load content types');
      } finally {
        setLoadingCT(false);
      }
    };
    fetchContentTypes();
  }, []);

  // Load entries when content type changes
  const handleSelectCT = async (id: number) => {
    const ct = contentTypes.find((c) => c.id === id) || null;
    setSelectedCT(ct);
    setEntries([]);
    if (!ct) return;

    setLoadingEntries(true);
    try {
      const res = await api.get('/entries', { params: { contentTypeId: id } });
      setEntries(res.data);
    } catch {
      messageApi.error('Failed to load entries');
    } finally {
      setLoadingEntries(false);
    }
  };

  const openCreateModal = () => {
    setEditingEntry(null);
    slugManualRef.current = false;
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (entry: Entry) => {
    setEditingEntry(entry);
    slugManualRef.current = true; // editing: treat slug as locked
    form.setFieldsValue({ slug: entry.slug, ...entry.data });
    setModalOpen(true);
  };

  const handleValuesChange = (changed: Record<string, any>) => {
    // If user changed the slug field directly, lock auto-gen
    if ('slug' in changed) {
      slugManualRef.current = true;
      return;
    }
    // If slug is already manually set or we're editing, skip
    if (slugManualRef.current || editingEntry) return;

    // Find the first text/textarea field and auto-generate slug from it
    const firstTextField = selectedCT?.schema.find(
      (f) => f.type === 'text' || f.type === 'textarea',
    );
    if (!firstTextField) return;

    if (firstTextField.name in changed) {
      const generated = toSlug(changed[firstTextField.name] || '');
      form.setFieldValue('slug', generated);
    }
  };

  const handleSubmit = async () => {
    if (!selectedCT) return;

    try {
      const values = await form.validateFields();
      const { slug, ...rest } = values;

      const payload = {
        contentTypeId: selectedCT.id,
        slug,
        data: rest,
      };

      if (editingEntry) {
        await api.put(`/entries/${editingEntry.id}`, {
          slug,
          data: rest,
        });
        messageApi.success('Entry updated');
      } else {
        await api.post('/entries', payload);
        messageApi.success('Entry created');
      }

      setModalOpen(false);
      handleSelectCT(selectedCT.id);
    } catch (err: any) {
      messageApi.error(err.response?.data?.message || 'Something went wrong');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/entries/${id}`);
      messageApi.success('Entry deleted');
      if (selectedCT) handleSelectCT(selectedCT.id);
    } catch (err: any) {
      messageApi.error(err.response?.data?.message || 'Delete failed');
    }
  };

  // Build table columns dynamically from schema
  const buildColumns = () => {
    if (!selectedCT) return [];

    const schemaColumns = selectedCT.schema.slice(0, 3).map((field) => ({
      title: field.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      key: field.name,
      render: (_: any, record: Entry) => {
        const val = record.data[field.name];
        if (val === undefined || val === null) return <Text type="secondary">—</Text>;
        if (field.type === 'boolean') return <Tag color={val ? 'green' : 'red'}>{val ? 'Yes' : 'No'}</Tag>;
        if (field.type === 'image') return val ? <img src={val} height={36} style={{ borderRadius: 4 }} /> : '—';
        const str = String(val);
        return str.length > 60 ? str.slice(0, 60) + '…' : str;
      },
    }));

    return [
      {
        title: 'Slug',
        dataIndex: 'slug',
        key: 'slug',
        render: (slug: string) => <Tag color="blue">{slug}</Tag>,
        width: 160,
      },
      ...schemaColumns,
      {
        title: 'Updated',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        render: (d: string) => new Date(d).toLocaleDateString(),
        width: 110,
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 100,
        render: (_: any, record: Entry) => (
          <Space>
            <Button
              icon={<EditOutlined />}
              size="small"
              onClick={() => openEditModal(record)}
            />
            <Popconfirm
              title="Delete this entry?"
              onConfirm={() => handleDelete(record.id)}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Button icon={<DeleteOutlined />} size="small" danger />
            </Popconfirm>
          </Space>
        ),
      },
    ];
  };

  return (
    <div>
      {contextHolder}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>
          Entries
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!selectedCT}
          onClick={openCreateModal}
        >
          Create Entry
        </Button>
      </div>

      {/* Content Type Selector */}
      <div style={{ marginBottom: 20 }}>
        <Text strong style={{ marginRight: 12 }}>Content Type:</Text>
        <Select
          placeholder="Select a content type"
          style={{ width: 260 }}
          loading={loadingCT}
          onChange={handleSelectCT}
          options={contentTypes.map((ct) => ({ label: ct.name, value: ct.id }))}
        />
      </div>

      {/* Entries Table */}
      {!selectedCT ? (
        <Empty
          image={<FileOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />}
          description="Select a content type to view its entries"
        />
      ) : (
        <Table
          dataSource={entries}
          columns={buildColumns()}
          rowKey="id"
          loading={loadingEntries}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'No entries yet. Click "Create Entry" to add one.' }}
        />
      )}

      {/* Create / Edit Modal */}
      <Modal
        title={
          editingEntry
            ? `Edit Entry — ${selectedCT?.name}`
            : `New Entry — ${selectedCT?.name}`
        }
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText={editingEntry ? 'Update' : 'Create'}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }} onValuesChange={handleValuesChange}>
          <Form.Item
            label="Slug"
            name="slug"
            rules={[
              { required: true, message: 'Slug is required' },
              {
                pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                message: 'Use lowercase letters, numbers and hyphens only',
              },
            ]}
            extra={
              editingEntry
                ? 'Slug cannot be changed after creation'
                : 'Auto-generated from the first text field — you can override it'
            }
          >
            <Input placeholder="my-entry-slug" disabled={!!editingEntry} />
          </Form.Item>

          {selectedCT && selectedCT.schema.length > 0 && (
            <>
              <Divider orientation="left" plain>
                Fields
              </Divider>
              {selectedCT.schema.map((field) => (
                <DynamicFormField key={field.name} field={field} form={form} />
              ))}
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}

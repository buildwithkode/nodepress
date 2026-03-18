'use client';

import {
  Typography, Button, Table, Modal, Form, Input, Select, Space,
  Popconfirm, message, Tag, Tooltip, Alert,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, CopyOutlined, KeyOutlined,
} from '@ant-design/icons';
import { useEffect, useState } from 'react';
import api from '../../../lib/axios';

const { Title, Text, Paragraph } = Typography;

interface ApiKey {
  id: number;
  name: string;
  key: string;
  permissions: { access: 'read' | 'write' | 'all'; contentTypes: string[] };
  createdAt: string;
  lastUsedAt: string | null;
}

interface ContentType {
  id: number;
  name: string;
}

const ACCESS_COLORS: Record<string, string> = { read: 'blue', write: 'orange', all: 'green' };

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null); // shown once after creation
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  const load = async () => {
    setLoading(true);
    try {
      const [keysRes, ctRes] = await Promise.all([
        api.get('/api-keys'),
        api.get('/content-types'),
      ]);
      setKeys(keysRes.data);
      setContentTypes(ctRes.data);
    } catch {
      messageApi.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        name: values.name,
        permissions: {
          access: values.access,
          contentTypes: values.contentTypes.includes('*') ? ['*'] : values.contentTypes,
        },
      };
      const res = await api.post('/api-keys', payload);
      setNewKey(res.data.key);
      form.resetFields();
      setModalOpen(false);
      load();
    } catch (err: any) {
      messageApi.error(err.response?.data?.message || 'Failed to create key');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api-keys/${id}`);
      messageApi.success('API key revoked');
      load();
    } catch (err: any) {
      messageApi.error(err.response?.data?.message || 'Failed to revoke key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    messageApi.success('Copied to clipboard');
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Space>
          <KeyOutlined style={{ color: '#1677ff' }} />
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      render: (key: string) => (
        <Space>
          <Text code style={{ fontSize: 12 }}>
            {key.slice(0, 14)}…{key.slice(-6)}
          </Text>
          <Tooltip title="Copy full key">
            <Button
              size="small"
              type="text"
              icon={<CopyOutlined />}
              onClick={() => copyToClipboard(key)}
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'Access',
      key: 'access',
      render: (_: any, record: ApiKey) => (
        <Tag color={ACCESS_COLORS[record.permissions.access]}>
          {record.permissions.access.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Content Types',
      key: 'contentTypes',
      render: (_: any, record: ApiKey) => {
        const cts = record.permissions.contentTypes;
        if (cts[0] === '*') return <Tag color="purple">ALL</Tag>;
        return (
          <Space wrap>
            {cts.map((ct) => <Tag key={ct}>{ct}</Tag>)}
          </Space>
        );
      },
    },
    {
      title: 'Last Used',
      dataIndex: 'lastUsedAt',
      key: 'lastUsedAt',
      render: (d: string | null) =>
        d ? new Date(d).toLocaleString() : <Text type="secondary">Never</Text>,
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (d: string) => new Date(d).toLocaleDateString(),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: any, record: ApiKey) => (
        <Popconfirm
          title="Revoke this API key?"
          description="Any app using it will immediately lose access."
          onConfirm={() => handleDelete(record.id)}
          okText="Revoke"
          okButtonProps={{ danger: true }}
        >
          <Button icon={<DeleteOutlined />} size="small" danger type="text" />
        </Popconfirm>
      ),
    },
  ];

  const ctOptions = [
    { label: 'All content types (*)', value: '*' },
    ...contentTypes.map((ct) => ({ label: ct.name, value: ct.name })),
  ];

  return (
    <div>
      {contextHolder}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>API Keys</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          New API Key
        </Button>
      </div>

      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        API keys let external applications access your content without a user login.
        Use <Text code>X-API-Key: &lt;key&gt;</Text> in the request header.
        Read-only keys can only call GET endpoints; write/all keys can also POST, PUT, DELETE.
      </Paragraph>

      {/* Show newly created key once */}
      {newKey && (
        <Alert
          type="success"
          showIcon
          closable
          onClose={() => setNewKey(null)}
          style={{ marginBottom: 20 }}
          message="API Key Created — Copy it now!"
          description={
            <Space>
              <Text code copyable style={{ fontSize: 13 }}>{newKey}</Text>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => copyToClipboard(newKey)}
              >
                Copy
              </Button>
            </Space>
          }
        />
      )}

      <Table
        dataSource={keys}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        locale={{ emptyText: 'No API keys yet. Click "New API Key" to create one.' }}
      />

      {/* Create Modal */}
      <Modal
        title="Create New API Key"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        okText="Create Key"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Key Name"
            name="name"
            rules={[{ required: true, message: 'Name is required' }]}
            extra='A label to identify this key, e.g. "Mobile App" or "Next.js Frontend"'
          >
            <Input placeholder="My App" />
          </Form.Item>

          <Form.Item
            label="Access Level"
            name="access"
            initialValue="read"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { label: 'Read — GET only', value: 'read' },
                { label: 'Write — POST / PUT / DELETE', value: 'write' },
                { label: 'All — full access', value: 'all' },
              ]}
            />
          </Form.Item>

          <Form.Item
            label="Allowed Content Types"
            name="contentTypes"
            initialValue={['*']}
            rules={[{ required: true, message: 'Select at least one content type' }]}
            extra='Select specific content types or choose "All" to allow access to everything'
          >
            <Select
              mode="multiple"
              placeholder="Select content types"
              options={ctOptions}
              onChange={(vals: string[]) => {
                // If user picks '*', deselect everything else; if they pick a specific one, deselect '*'
                const last = vals[vals.length - 1];
                if (last === '*') {
                  form.setFieldValue('contentTypes', ['*']);
                } else if (vals.includes('*')) {
                  form.setFieldValue('contentTypes', vals.filter((v) => v !== '*'));
                }
              }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

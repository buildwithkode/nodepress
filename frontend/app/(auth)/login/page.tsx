'use client';

import { Form, Input, Button, Card, Typography, message } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../lib/axios';

const { Title } = Typography;

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();

  // Redirect to setup if no admin exists yet
  useEffect(() => {
    api.get('/auth/setup-status').then((res) => {
      if (res.data.required) router.replace('/setup');
    }).catch(() => {});
  }, []);

  const onFinish = async (values: { email: string; password: string }) => {
    try {
      const res = await api.post('/auth/login', values);
      login(res.data.access_token, res.data.user);
      router.push('/');
    } catch (err: any) {
      messageApi.error(err.response?.data?.message || 'Invalid credentials');
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f2f5',
      }}
    >
      {contextHolder}
      <Card style={{ width: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={3} style={{ margin: 0 }}>
            NodePress CMS
          </Title>
          <Typography.Text type="secondary">Admin Panel</Typography.Text>
        </div>

        <Form layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item
            label="Email"
            name="email"
            rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
          >
            <Input size="large" placeholder="admin@example.com" />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: 'Enter your password' }]}
          >
            <Input.Password size="large" placeholder="••••••••" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" size="large" block>
              Login
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

import { Layout, Menu, Button, Typography, Avatar } from 'antd';
import {
  DashboardOutlined,
  AppstoreOutlined,
  FileOutlined,
  PictureOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/content-types', icon: <AppstoreOutlined />, label: 'Content Types' },
  { key: '/entries', icon: <FileOutlined />, label: 'Entries' },
  { key: '/media', icon: <PictureOutlined />, label: 'Media' },
];

const AdminLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        breakpoint="lg"
        collapsedWidth="0"
        style={{ background: '#001529' }}
      >
        <div
          style={{
            padding: '16px',
            color: '#fff',
            fontWeight: 700,
            fontSize: 18,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            marginBottom: 8,
          }}
        >
          NodePress
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
        >
          <Avatar icon={<UserOutlined />} size="small" />
          <Text>{user?.email}</Text>
          <Button
            icon={<LogoutOutlined />}
            type="text"
            onClick={handleLogout}
          >
            Logout
          </Button>
        </Header>

        <Content style={{ margin: 24 }}>
          <div
            style={{
              background: '#fff',
              padding: 24,
              borderRadius: 8,
              minHeight: 'calc(100vh - 112px)',
            }}
          >
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default AdminLayout;

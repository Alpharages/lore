import { AdminProjectsTable } from "@/components/app/admin-projects-table";

const AdminPage = () => {
  return (
    <>
      <h1 className="mb-6 text-xl font-semibold text-foreground">Admin</h1>
      <AdminProjectsTable />
    </>
  );
};

export default AdminPage;

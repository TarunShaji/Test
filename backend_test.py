#!/usr/bin/env python3
"""
Agency Dashboard Backend API Testing
Tests all backend endpoints with comprehensive scenarios.
"""

import requests
import json
import sys
from datetime import datetime

# Base URL from environment
BASE_URL = "https://workflow-hub-274.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

class APITester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.test_results = []
        self.bandolier_client_id = None
        
    def log_test(self, test_name, success, details="", error_msg=""):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "error": error_msg,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        if error_msg:
            print(f"   Error: {error_msg}")
        print()

    def make_request(self, method, endpoint, data=None, headers=None, expect_status=None):
        """Make HTTP request with error handling"""
        try:
            url = f"{API_BASE}{endpoint}"
            req_headers = {"Content-Type": "application/json"}
            if headers:
                req_headers.update(headers)
            
            if self.auth_token:
                req_headers["Authorization"] = f"Bearer {self.auth_token}"
                
            if method == "GET":
                response = self.session.get(url, headers=req_headers)
            elif method == "POST":
                response = self.session.post(url, json=data, headers=req_headers)
            elif method == "PUT":
                response = self.session.put(url, json=data, headers=req_headers)
            elif method == "DELETE":
                response = self.session.delete(url, headers=req_headers)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            # Check expected status if provided
            if expect_status and response.status_code != expect_status:
                return None, f"Expected status {expect_status}, got {response.status_code}: {response.text}"
                
            return response, None
        except Exception as e:
            return None, str(e)

    def test_seed_data(self):
        """Test POST /api/seed - Create demo data"""
        response, error = self.make_request("POST", "/seed")
        if error:
            self.log_test("Seed Data Creation", False, error_msg=error)
            return False
            
        if response.status_code not in [200, 201]:
            self.log_test("Seed Data Creation", False, 
                         error_msg=f"Status {response.status_code}: {response.text}")
            return False
            
        self.log_test("Seed Data Creation", True, "Demo data seeded successfully")
        return True

    def test_auth_login(self):
        """Test POST /api/auth/login"""
        login_data = {
            "email": "admin@agency.com",
            "password": "admin123"
        }
        
        response, error = self.make_request("POST", "/auth/login", login_data)
        if error:
            self.log_test("Auth Login", False, error_msg=error)
            return False
            
        if response.status_code != 200:
            self.log_test("Auth Login", False, 
                         error_msg=f"Status {response.status_code}: {response.text}")
            return False
            
        try:
            data = response.json()
            if "token" not in data or "user" not in data:
                self.log_test("Auth Login", False, error_msg="Missing token or user in response")
                return False
                
            self.auth_token = data["token"]
            user = data["user"]
            
            self.log_test("Auth Login", True, 
                         f"Login successful for {user.get('email', 'unknown user')}")
            return True
        except json.JSONDecodeError:
            self.log_test("Auth Login", False, error_msg="Invalid JSON response")
            return False

    def test_get_clients(self):
        """Test GET /api/clients - List all clients"""
        response, error = self.make_request("GET", "/clients")
        if error:
            self.log_test("Get Clients", False, error_msg=error)
            return False
            
        if response.status_code != 200:
            self.log_test("Get Clients", False, 
                         error_msg=f"Status {response.status_code}: {response.text}")
            return False
            
        try:
            clients = response.json()
            if not isinstance(clients, list):
                self.log_test("Get Clients", False, error_msg="Response is not a list")
                return False
                
            # Should have 3 clients: Bandolier, Behno, Warehouse Group
            expected_names = {"Bandolier", "Behno", "Warehouse Group"}
            actual_names = {client.get("name") for client in clients}
            
            # Store Bandolier client ID for later tests
            for client in clients:
                if client.get("name") == "Bandolier":
                    self.bandolier_client_id = client.get("id")
                    
            if not expected_names.issubset(actual_names):
                missing = expected_names - actual_names
                self.log_test("Get Clients", False, 
                             error_msg=f"Missing expected clients: {missing}")
                return False
                
            # Check task counts are present
            for client in clients:
                required_fields = ["task_count", "in_progress_count", "approval_count"]
                for field in required_fields:
                    if field not in client:
                        self.log_test("Get Clients", False, 
                                     error_msg=f"Missing {field} in client data")
                        return False
                        
            self.log_test("Get Clients", True, 
                         f"Retrieved {len(clients)} clients with task counts")
            return True
        except json.JSONDecodeError:
            self.log_test("Get Clients", False, error_msg="Invalid JSON response")
            return False

    def test_create_client(self):
        """Test POST /api/clients - Create new client"""
        if not self.auth_token:
            self.log_test("Create Client", False, error_msg="No auth token available")
            return False
            
        client_data = {
            "name": "Test Client API",
            "service_type": "SEO + Design",
            "portal_password": None
        }
        
        response, error = self.make_request("POST", "/clients", client_data)
        if error:
            self.log_test("Create Client", False, error_msg=error)
            return False
            
        if response.status_code not in [200, 201]:
            self.log_test("Create Client", False, 
                         error_msg=f"Status {response.status_code}: {response.text}")
            return False
            
        try:
            client = response.json()
            if client.get("name") != client_data["name"]:
                self.log_test("Create Client", False, error_msg="Created client name mismatch")
                return False
                
            self.log_test("Create Client", True, f"Created client: {client.get('name')}")
            return True
        except json.JSONDecodeError:
            self.log_test("Create Client", False, error_msg="Invalid JSON response")
            return False

    def test_get_tasks(self):
        """Test GET /api/tasks - List all tasks"""
        response, error = self.make_request("GET", "/tasks")
        if error:
            self.log_test("Get Tasks", False, error_msg=error)
            return False
            
        if response.status_code != 200:
            self.log_test("Get Tasks", False, 
                         error_msg=f"Status {response.status_code}: {response.text}")
            return False
            
        try:
            tasks = response.json()
            if not isinstance(tasks, list):
                self.log_test("Get Tasks", False, error_msg="Response is not a list")
                return False
                
            # Should have 11 tasks from seed data
            if len(tasks) < 11:
                self.log_test("Get Tasks", False, 
                             error_msg=f"Expected at least 11 tasks, got {len(tasks)}")
                return False
                
            # Check enriched data (client_name, assigned_to_name)
            for task in tasks[:3]:  # Check first 3 tasks
                if "client_name" not in task:
                    self.log_test("Get Tasks", False, error_msg="Missing client_name enrichment")
                    return False
                    
            self.log_test("Get Tasks", True, 
                         f"Retrieved {len(tasks)} tasks with enriched data")
            return True
        except json.JSONDecodeError:
            self.log_test("Get Tasks", False, error_msg="Invalid JSON response")
            return False

    def test_filter_tasks_by_status(self):
        """Test GET /api/tasks?status=In+Progress - Filter by status"""
        response, error = self.make_request("GET", "/tasks?status=In+Progress")
        if error:
            self.log_test("Filter Tasks by Status", False, error_msg=error)
            return False
            
        if response.status_code != 200:
            self.log_test("Filter Tasks by Status", False, 
                         error_msg=f"Status {response.status_code}: {response.text}")
            return False
            
        try:
            tasks = response.json()
            if not isinstance(tasks, list):
                self.log_test("Filter Tasks by Status", False, error_msg="Response is not a list")
                return False
                
            # All tasks should have "In Progress" status
            for task in tasks:
                if task.get("status") != "In Progress":
                    self.log_test("Filter Tasks by Status", False, 
                                 error_msg=f"Found task with status '{task.get('status')}', expected 'In Progress'")
                    return False
                    
            self.log_test("Filter Tasks by Status", True, 
                         f"Retrieved {len(tasks)} 'In Progress' tasks")
            return True
        except json.JSONDecodeError:
            self.log_test("Filter Tasks by Status", False, error_msg="Invalid JSON response")
            return False

    def test_filter_tasks_by_client(self):
        """Test GET /api/tasks?client_id={bandolier_client_id} - Filter by client"""
        if not self.bandolier_client_id:
            self.log_test("Filter Tasks by Client", False, error_msg="Bandolier client ID not available")
            return False
            
        response, error = self.make_request("GET", f"/tasks?client_id={self.bandolier_client_id}")
        if error:
            self.log_test("Filter Tasks by Client", False, error_msg=error)
            return False
            
        if response.status_code != 200:
            self.log_test("Filter Tasks by Client", False, 
                         error_msg=f"Status {response.status_code}: {response.text}")
            return False
            
        try:
            tasks = response.json()
            if not isinstance(tasks, list):
                self.log_test("Filter Tasks by Client", False, error_msg="Response is not a list")
                return False
                
            # All tasks should belong to Bandolier
            for task in tasks:
                if task.get("client_id") != self.bandolier_client_id:
                    self.log_test("Filter Tasks by Client", False, 
                                 error_msg=f"Found task for wrong client: {task.get('client_id')}")
                    return False
                if task.get("client_name") != "Bandolier":
                    self.log_test("Filter Tasks by Client", False, 
                                 error_msg=f"Wrong client_name: {task.get('client_name')}")
                    return False
                    
            self.log_test("Filter Tasks by Client", True, 
                         f"Retrieved {len(tasks)} tasks for Bandolier")
            return True
        except json.JSONDecodeError:
            self.log_test("Filter Tasks by Client", False, error_msg="Invalid JSON response")
            return False

    def test_create_task(self):
        """Test POST /api/tasks - Create new task"""
        if not self.auth_token:
            self.log_test("Create Task", False, error_msg="No auth token available")
            return False
            
        if not self.bandolier_client_id:
            self.log_test("Create Task", False, error_msg="Bandolier client ID not available")
            return False
            
        task_data = {
            "title": "API Test Task",
            "client_id": self.bandolier_client_id,
            "category": "Testing",
            "status": "To Be Started",
            "priority": "P1",
            "description": "Task created via API test"
        }
        
        response, error = self.make_request("POST", "/tasks", task_data)
        if error:
            self.log_test("Create Task", False, error_msg=error)
            return False
            
        if response.status_code not in [200, 201]:
            self.log_test("Create Task", False, 
                         error_msg=f"Status {response.status_code}: {response.text}")
            return False
            
        try:
            task = response.json()
            if task.get("title") != task_data["title"]:
                self.log_test("Create Task", False, error_msg="Created task title mismatch")
                return False
                
            self.created_task_id = task.get("id")
            self.log_test("Create Task", True, f"Created task: {task.get('title')}")
            return True
        except json.JSONDecodeError:
            self.log_test("Create Task", False, error_msg="Invalid JSON response")
            return False

    def test_update_task(self):
        """Test PUT /api/tasks/{task_id} - Update task"""
        if not self.auth_token:
            self.log_test("Update Task", False, error_msg="No auth token available")
            return False
            
        if not hasattr(self, 'created_task_id') or not self.created_task_id:
            self.log_test("Update Task", False, error_msg="No created task ID available")
            return False
            
        update_data = {
            "status": "In Progress",
            "remarks": "Updated via API test"
        }
        
        response, error = self.make_request("PUT", f"/tasks/{self.created_task_id}", update_data)
        if error:
            self.log_test("Update Task", False, error_msg=error)
            return False
            
        if response.status_code != 200:
            self.log_test("Update Task", False, 
                         error_msg=f"Status {response.status_code}: {response.text}")
            return False
            
        try:
            task = response.json()
            if task.get("status") != update_data["status"]:
                self.log_test("Update Task", False, error_msg="Task status not updated")
                return False
                
            if task.get("remarks") != update_data["remarks"]:
                self.log_test("Update Task", False, error_msg="Task remarks not updated")
                return False
                
            self.log_test("Update Task", True, "Task updated successfully")
            return True
        except json.JSONDecodeError:
            self.log_test("Update Task", False, error_msg="Invalid JSON response")
            return False

    def test_bulk_update_tasks(self):
        """Test POST /api/tasks/bulk-update - Bulk update tasks"""
        if not self.auth_token:
            self.log_test("Bulk Update Tasks", False, error_msg="No auth token available")
            return False
            
        if not hasattr(self, 'created_task_id') or not self.created_task_id:
            self.log_test("Bulk Update Tasks", False, error_msg="No created task ID available")
            return False
            
        bulk_data = {
            "task_ids": [self.created_task_id],
            "updates": {
                "priority": "P0",
                "remarks": "Bulk updated via API test"
            }
        }
        
        response, error = self.make_request("POST", "/tasks/bulk-update", bulk_data)
        if error:
            self.log_test("Bulk Update Tasks", False, error_msg=error)
            return False
            
        if response.status_code != 200:
            self.log_test("Bulk Update Tasks", False, 
                         error_msg=f"Status {response.status_code}: {response.text}")
            return False
            
        try:
            result = response.json()
            if "Updated 1 tasks" not in result.get("message", ""):
                self.log_test("Bulk Update Tasks", False, 
                             error_msg=f"Unexpected response: {result}")
                return False
                
            self.log_test("Bulk Update Tasks", True, "Bulk update successful")
            return True
        except json.JSONDecodeError:
            self.log_test("Bulk Update Tasks", False, error_msg="Invalid JSON response")
            return False

    def test_get_team(self):
        """Test GET /api/team - List team members"""
        response, error = self.make_request("GET", "/team")
        if error:
            self.log_test("Get Team Members", False, error_msg=error)
            return False
            
        if response.status_code != 200:
            self.log_test("Get Team Members", False, 
                         error_msg=f"Status {response.status_code}: {response.text}")
            return False
            
        try:
            members = response.json()
            if not isinstance(members, list):
                self.log_test("Get Team Members", False, error_msg="Response is not a list")
                return False
                
            # Should have 5 members from seed data
            if len(members) < 5:
                self.log_test("Get Team Members", False, 
                             error_msg=f"Expected at least 5 members, got {len(members)}")
                return False
                
            # Check password_hash is not returned
            for member in members:
                if "password_hash" in member:
                    self.log_test("Get Team Members", False, 
                                 error_msg="password_hash found in response (security issue)")
                    return False
                    
            self.log_test("Get Team Members", True, 
                         f"Retrieved {len(members)} team members without password_hash")
            return True
        except json.JSONDecodeError:
            self.log_test("Get Team Members", False, error_msg="Invalid JSON response")
            return False

    def test_get_reports(self):
        """Test GET /api/reports - List reports"""
        response, error = self.make_request("GET", "/reports")
        if error:
            self.log_test("Get Reports", False, error_msg=error)
            return False
            
        if response.status_code != 200:
            self.log_test("Get Reports", False, 
                         error_msg=f"Status {response.status_code}: {response.text}")
            return False
            
        try:
            reports = response.json()
            if not isinstance(reports, list):
                self.log_test("Get Reports", False, error_msg="Response is not a list")
                return False
                
            # Should have at least 3 reports from seed data
            if len(reports) < 3:
                self.log_test("Get Reports", False, 
                             error_msg=f"Expected at least 3 reports, got {len(reports)}")
                return False
                
            # Check client_name enrichment
            for report in reports:
                if "client_name" not in report:
                    self.log_test("Get Reports", False, error_msg="Missing client_name enrichment")
                    return False
                    
            self.log_test("Get Reports", True, 
                         f"Retrieved {len(reports)} reports with client names")
            return True
        except json.JSONDecodeError:
            self.log_test("Get Reports", False, error_msg="Invalid JSON response")
            return False

    def test_get_stats(self):
        """Test GET /api/stats - Dashboard statistics"""
        response, error = self.make_request("GET", "/stats")
        if error:
            self.log_test("Get Dashboard Stats", False, error_msg=error)
            return False
            
        if response.status_code != 200:
            self.log_test("Get Dashboard Stats", False, 
                         error_msg=f"Status {response.status_code}: {response.text}")
            return False
            
        try:
            stats = response.json()
            required_fields = ["totalClients", "inProgress", "toBeApproved", "blocked", "recentActivity"]
            
            for field in required_fields:
                if field not in stats:
                    self.log_test("Get Dashboard Stats", False, 
                                 error_msg=f"Missing required field: {field}")
                    return False
                    
            # Check recentActivity is a list
            if not isinstance(stats.get("recentActivity"), list):
                self.log_test("Get Dashboard Stats", False, error_msg="recentActivity is not a list")
                return False
                
            self.log_test("Get Dashboard Stats", True, 
                         f"Stats: {stats['totalClients']} clients, {stats['inProgress']} in progress")
            return True
        except json.JSONDecodeError:
            self.log_test("Get Dashboard Stats", False, error_msg="Invalid JSON response")
            return False

    def test_portal_bandolier(self):
        """Test GET /api/portal/bandolier - Public client portal"""
        response, error = self.make_request("GET", "/portal/bandolier")
        if error:
            self.log_test("Portal Bandolier", False, error_msg=error)
            return False
            
        if response.status_code != 200:
            self.log_test("Portal Bandolier", False, 
                         error_msg=f"Status {response.status_code}: {response.text}")
            return False
            
        try:
            data = response.json()
            required_fields = ["client", "tasks", "reports"]
            
            for field in required_fields:
                if field not in data:
                    self.log_test("Portal Bandolier", False, 
                                 error_msg=f"Missing required field: {field}")
                    return False
                    
            if data["client"].get("name") != "Bandolier":
                self.log_test("Portal Bandolier", False, 
                             error_msg=f"Wrong client name: {data['client'].get('name')}")
                return False
                
            self.log_test("Portal Bandolier", True, 
                         f"Portal data for {data['client']['name']} with {len(data['tasks'])} tasks")
            return True
        except json.JSONDecodeError:
            self.log_test("Portal Bandolier", False, error_msg="Invalid JSON response")
            return False

    def test_portal_behno_password_protection(self):
        """Test GET /api/portal/behno - Password protected portal"""
        response, error = self.make_request("GET", "/portal/behno")
        if error:
            self.log_test("Portal Behno Password Protection", False, error_msg=error)
            return False
            
        # Should return 401 with has_password: true
        if response.status_code != 401:
            self.log_test("Portal Behno Password Protection", False, 
                         error_msg=f"Expected 401 status, got {response.status_code}")
            return False
            
        try:
            data = response.json()
            if not data.get("has_password"):
                self.log_test("Portal Behno Password Protection", False, 
                             error_msg="has_password should be true")
                return False
                
            if data.get("client_name") != "Behno":
                self.log_test("Portal Behno Password Protection", False, 
                             error_msg=f"Wrong client_name: {data.get('client_name')}")
                return False
                
            self.log_test("Portal Behno Password Protection", True, 
                         "Correctly returned 401 with has_password:true for Behno")
            return True
        except json.JSONDecodeError:
            self.log_test("Portal Behno Password Protection", False, error_msg="Invalid JSON response")
            return False

    def run_all_tests(self):
        """Run all backend tests in sequence"""
        print("🚀 Starting Agency Dashboard Backend API Tests")
        print("=" * 60)
        
        # Test sequence - order matters for dependencies
        tests = [
            self.test_seed_data,
            self.test_auth_login,
            self.test_get_clients,
            self.test_create_client,
            self.test_get_tasks,
            self.test_filter_tasks_by_status,
            self.test_filter_tasks_by_client,
            self.test_create_task,
            self.test_update_task,
            self.test_bulk_update_tasks,
            self.test_get_team,
            self.test_get_reports,
            self.test_get_stats,
            self.test_portal_bandolier,
            self.test_portal_behno_password_protection,
        ]
        
        passed = 0
        failed = 0
        
        for test in tests:
            try:
                if test():
                    passed += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"❌ FAIL: {test.__name__} - Exception: {str(e)}")
                self.log_test(test.__name__, False, error_msg=f"Exception: {str(e)}")
                failed += 1
        
        print("=" * 60)
        print(f"🏁 Test Results: {passed} passed, {failed} failed")
        
        if failed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['error']}")
        else:
            print("\n✅ All tests passed!")
            
        return failed == 0

if __name__ == "__main__":
    print("Agency Dashboard Backend API Testing")
    print(f"Base URL: {BASE_URL}")
    print(f"API Base: {API_BASE}")
    print()
    
    tester = APITester()
    success = tester.run_all_tests()
    
    sys.exit(0 if success else 1)
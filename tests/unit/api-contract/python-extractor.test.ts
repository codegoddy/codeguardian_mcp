/**
 * Unit tests for API Contract Guardian - Python Extractor
 *
 * @format
 */

import {
  extractRoutesFromFile,
  extractModelsFromFile,
} from "../../../src/api-contract/extractors/python.js";
import type { RouteDefinition, ModelDefinition } from "../../../src/api-contract/types.js";

describe("Python Extractor", () => {
  describe("extractRoutesFromFile", () => {
    it("should extract FastAPI routes", () => {
      const content = `
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class ClientCreate(BaseModel):
    name: str
    email: str

@app.post("/api/clients")
async def create_client(data: ClientCreate):
    return {"id": 1, "name": data.name}

@app.get("/api/clients/{client_id}")
async def get_client(client_id: int):
    return {"id": client_id}

@app.put("/api/clients/{client_id}")
async def update_client(client_id: int, data: ClientCreate):
    return {"id": client_id, "name": data.name}

@app.delete("/api/clients/{client_id}")
async def delete_client(client_id: int):
    return {"deleted": True}
`;

      const routes = extractRoutesFromFile(content, "test.py", "fastapi");

      expect(routes).toHaveLength(4);

      // Check POST route
      const postRoute = routes.find((r) => r.method === "POST");
      expect(postRoute).toBeDefined();
      expect(postRoute?.path).toBe("/api/clients");
      expect(postRoute?.handler).toBe("create_client");
      expect(postRoute?.requestModel).toBe("ClientCreate");

      // Check GET route
      const getRoute = routes.find((r) => r.method === "GET");
      expect(getRoute).toBeDefined();
      expect(getRoute?.path).toBe("/api/clients/{client_id}");
      expect(getRoute?.handler).toBe("get_client");

      // Check PUT route
      const putRoute = routes.find((r) => r.method === "PUT");
      expect(putRoute).toBeDefined();
      expect(putRoute?.handler).toBe("update_client");

      // Check DELETE route
      const deleteRoute = routes.find((r) => r.method === "DELETE");
      expect(deleteRoute).toBeDefined();
      expect(deleteRoute?.handler).toBe("delete_client");
    });

    it("should extract Flask routes", () => {
      const content = `
from flask import Flask, request

app = Flask(__name__)

@app.route("/api/clients", methods=["POST"])
def create_client():
    data = request.json
    return {"id": 1}

@app.route("/api/clients/<int:client_id>", methods=["GET"])
def get_client(client_id):
    return {"id": client_id}
`;

      const routes = extractRoutesFromFile(content, "test.py", "flask");

      expect(routes).toHaveLength(2);

      const postRoute = routes.find((r) => r.path === "/api/clients");
      expect(postRoute).toBeDefined();
      expect(postRoute?.method).toBe("POST");
      expect(postRoute?.handler).toBe("create_client");

      const getRoute = routes.find((r) => r.path === "/api/clients/<int:client_id>");
      expect(getRoute).toBeDefined();
      expect(getRoute?.method).toBe("GET");
      expect(getRoute?.handler).toBe("get_client");
    });

    it("should extract FastAPI routes with response models", () => {
      const content = `
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Client(BaseModel):
    id: int
    name: str

class ClientCreate(BaseModel):
    name: str

@app.post("/api/clients")
async def create_client(data: ClientCreate) -> Client:
    return Client(id=1, name=data.name)
`;

      const routes = extractRoutesFromFile(content, "test.py", "fastapi");

      expect(routes).toHaveLength(1);
      expect(routes[0].requestModel).toBe("ClientCreate");
      expect(routes[0].responseModel).toBe("Client");
    });

    it("should handle routes without type hints", () => {
      const content = `
from fastapi import FastAPI

app = FastAPI()

@app.get("/api/health")
def health_check():
    return {"status": "ok"}
`;

      const routes = extractRoutesFromFile(content, "test.py", "fastapi");

      expect(routes).toHaveLength(1);
      expect(routes[0].method).toBe("GET");
      expect(routes[0].path).toBe("/api/health");
      expect(routes[0].handler).toBe("health_check");
      expect(routes[0].requestModel).toBeUndefined();
      expect(routes[0].responseModel).toBeUndefined();
    });
  });

  describe("extractModelsFromFile", () => {
    it("should extract Pydantic models", () => {
      const content = `
from pydantic import BaseModel
from typing import Optional

class ClientCreate(BaseModel):
    name: str
    email: str
    user_id: str

class Client(BaseModel):
    id: int
    name: str
    email: str
    user_id: str
`;

      const models = extractModelsFromFile(content, "test.py");

      expect(models).toHaveLength(2);

      const createModel = models.find((m) => m.name === "ClientCreate");
      expect(createModel).toBeDefined();
      expect(createModel?.fields).toHaveLength(3);
      expect(createModel?.fields[0].name).toBe("name");
      expect(createModel?.fields[0].type).toBe("str");
      expect(createModel?.fields[0].required).toBe(true);

      const clientModel = models.find((m) => m.name === "Client");
      expect(clientModel).toBeDefined();
      expect(clientModel?.fields).toHaveLength(4);
      expect(clientModel?.fields[0].name).toBe("id");
      expect(clientModel?.fields[0].type).toBe("int");
    });

    it("should handle optional fields", () => {
      const content = `
from pydantic import BaseModel
from typing import Optional

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
`;

      const models = extractModelsFromFile(content, "test.py");

      expect(models).toHaveLength(1);
      expect(models[0].fields).toHaveLength(2);
      expect(models[0].fields[0].name).toBe("name");
      expect(models[0].fields[0].type).toBe("Optional[str]");
      expect(models[0].fields[0].required).toBe(false);
    });

    it("should handle fields with default values", () => {
      const content = `
from pydantic import BaseModel

class Config(BaseModel):
    debug: bool = False
    port: int = 8000
    host: str = "localhost"
`;

      const models = extractModelsFromFile(content, "test.py");

      expect(models).toHaveLength(1);
      expect(models[0].fields).toHaveLength(3);

      const debugField = models[0].fields.find((f) => f.name === "debug");
      expect(debugField?.required).toBe(false);
      expect(debugField?.default).toBe("False");

      const portField = models[0].fields.find((f) => f.name === "port");
      expect(portField?.required).toBe(false);
      expect(portField?.default).toBe("8000");
    });

    it("should handle required fields with Field(...)", () => {
      const content = `
from pydantic import BaseModel, Field

class ClientCreate(BaseModel):
    name: str = Field(...)
    email: str = Field(..., description="Client email")
`;

      const models = extractModelsFromFile(content, "test.py");

      expect(models).toHaveLength(1);
      expect(models[0].fields).toHaveLength(2);

      const nameField = models[0].fields.find((f) => f.name === "name");
      expect(nameField?.required).toBe(true);
    });

    it("should ignore non-Pydantic classes", () => {
      const content = `
from pydantic import BaseModel

class Client(BaseModel):
    name: str

class Helper:
    def do_something(self):
        pass

class AnotherHelper:
    value: int
`;

      const models = extractModelsFromFile(content, "test.py");

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe("Client");
    });
  });
});

/**
 * @format
 */

import { describe, it, expect } from "vitest";
import {
  extractPydanticModelsFromPythonAST,
  extractRoutesFromPythonAST,
} from "../../src/api-contract/extractors/pythonAstUtils.js";

describe("API Contract - Python AST utilities", () => {
  it("extracts FastAPI routes from decorators and includes APIRouter(prefix=...)", () => {
    const code = `
from fastapi import APIRouter

router = APIRouter(prefix="/v1")

@router.post("/clients")
async def create_client(data: ClientCreate, verbose: bool = False) -> Client:
    return Client()
`;

    const routes = extractRoutesFromPythonAST(code, "backend/routes/clients.py", "fastapi");
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("POST");
    expect(routes[0].path).toBe("/v1/clients");
    expect(routes[0].handler).toBe("create_client");
    expect(routes[0].requestModel).toBe("ClientCreate");
    expect(routes[0].responseModel).toBe("Client");
    expect(routes[0].queryParams?.some((p) => p.name === "verbose")).toBe(true);
  });

  it("extracts Flask routes and methods", () => {
    const code = `
from flask import Flask
app = Flask(__name__)

@app.route("/ping", methods=["GET"])
def ping():
    return "ok"
`;

    const routes = extractRoutesFromPythonAST(code, "backend/app.py", "flask");
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("GET");
    expect(routes[0].path).toBe("/ping");
    expect(routes[0].handler).toBe("ping");
  });

  it("extracts Pydantic models and required/optional fields", () => {
    const code = `
from pydantic import BaseModel, Field
from typing import Optional

class ClientCreate(BaseModel):
    name: str
    age: int = 0
    email: Optional[str] = None
    tag: str = Field(...)
`;

    const models = extractPydanticModelsFromPythonAST(code, "backend/models.py");
    expect(models).toHaveLength(1);
    expect(models[0].name).toBe("ClientCreate");

    const byName = new Map(models[0].fields.map((f) => [f.name, f]));
    expect(byName.get("name")?.required).toBe(true);
    expect(byName.get("age")?.required).toBe(false);
    expect(byName.get("email")?.required).toBe(false);
    expect(byName.get("tag")?.required).toBe(true);
  });
});


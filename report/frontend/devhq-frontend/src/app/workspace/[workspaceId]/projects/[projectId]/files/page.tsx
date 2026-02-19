/** @format */

"use client";

import React, { useState, useRef } from "react";
import { useParams } from "next/navigation";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { useProject, ProjectFile } from "@/contexts/project-context";
import { useFilesBundle } from "@/lib/api/bundles/filesBundle";
import {
  FolderOpen,
  Upload,
  Archive,
  Plus,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import LoadingSpinner from "../../../components/LoadingSpinner";

import { withPageAccess } from "@/components/access/with-page-access";
import { FileOwnershipDisplay } from "@/components/files/file-ownership-display";

function FilesPage() {
  const params = useParams() as { workspaceId: string; projectId: string };
  const { projectId, workspaceId } = params;

  // Use bundle for GET operations (files fetching with caching)
  const { files, isLoading, error, refetch } = useFilesBundle(
    projectId,
    workspaceId
  );

  // Use context for CRUD operations (upload, update, delete)
  const {
    addFile,
    deleteFile,
    isUploadingFile,
    isDeletingFile,
  } = useProject();

  // Handle null/undefined files from bundle
  const filesList: ProjectFile[] = files || [];

  // Local state
  const [selectedCategory, setSelectedCategory] = useState<
    "all" | "design" | "document" | "code" | "image" | "other"
  >("all");
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [newFile, setNewFile] = useState({
    name: "",
    description: "",
    category: "document" as "design" | "document" | "code" | "image" | "other",
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [fileToDeleteId, setFileToDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Files now come from the bundle with React Query caching

  // Filter files by category
  const filteredFiles =
    selectedCategory === "all"
      ? filesList
      : filesList.filter((file) => file.category === selectedCategory);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // File management functions
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    console.log("File selected:", file);
    if (file) {
      setNewFile((prevNewFile) => ({ ...prevNewFile, name: file.name }));
    }
  };

  const handleUploadSubmit = () => {
    console.log("Attempting upload...");
    console.log(
      "fileInputRef.current?.files?.[0]:",
      fileInputRef.current?.files?.[0]
    );
    console.log("newFile.name:", newFile.name);
    console.log("newFile.name.trim():", newFile.name.trim());
    if (fileInputRef.current?.files?.[0] && newFile.name.trim()) {
      addFile(fileInputRef.current.files[0], {
        name: newFile.name,
        category: newFile.category,
        description: newFile.description,
      });

      setNewFile({
        name: "",
        description: "",
        category: "document",
      });
      setShowUploadForm(false);
    }
  };



  const handleDeleteFile = (fileId: string) => {
    setFileToDeleteId(fileId);
    setShowDeleteModal(true);
  };

  const categories: Array<{
    key: "all" | "design" | "document" | "code" | "image" | "other";
    label: string;
    count: number;
  }> = [
    { key: "all", label: "All Files", count: filesList.length },
    {
      key: "design",
      label: "Design",
      count: filesList.filter((f: ProjectFile) => f.category === "design")
        .length,
    },
    {
      key: "document",
      label: "Documents",
      count: filesList.filter((f: ProjectFile) => f.category === "document")
        .length,
    },
    {
      key: "code",
      label: "Code",
      count: filesList.filter((f: ProjectFile) => f.category === "code").length,
    },
    {
      key: "image",
      label: "Images",
      count: filesList.filter((f: ProjectFile) => f.category === "image")
        .length,
    },
    {
      key: "other",
      label: "Other",
      count: filesList.filter((f: ProjectFile) => f.category === "other")
        .length,
    },
  ];

  const totalSize = filesList.reduce(
    (sum: number, file: ProjectFile) => sum + file.size,
    0
  );

  if (isLoading) {
    return (
      <WorkspaceLayout>
        <div className="p-4 md:p-6 pt-8 md:pt-12 space-y-8 max-w-6xl mx-auto w-full">
          <div className="flex items-center justify-center">
            <LoadingSpinner size="md" color="black" />
            <span className="ml-3 text-gray-400">Loading project files...</span>
          </div>
        </div>
      </WorkspaceLayout>
    );
  }

  if (error) {
    return (
      <WorkspaceLayout>
        <div className="p-4 md:p-6 pt-8 md:pt-12 space-y-8 max-w-6xl mx-auto w-full">
          <div className="text-red-400">
            Error loading files: {error.message}
            <button
              onClick={() => refetch()}
              className="ml-4 border border-red-400/30 bg-red-400/10 px-3 py-1 text-red-400 hover:bg-red-400/20"
            >
              Retry
            </button>
          </div>
        </div>
      </WorkspaceLayout>
    );
  }

  return (
    <WorkspaceLayout>
      <div className="p-4 md:p-6 pt-8 md:pt-12 space-y-8 max-w-6xl mx-auto w-full">
        {/* Navigation */}
        <div className="space-y-4">
          {/* FILES & ASSETS heading */}
          <h1 className="text-xs font-mono text-white/40 uppercase tracking-wider">
            Files & Assets
          </h1>

          {/* Project heading */}
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <h2 className="text-2xl font-semibold text-white">
                Project Files & Asset Management
              </h2>
            </div>
            <button
              onClick={() => setShowUploadForm(true)}
              className="border border-purple-400/30 bg-purple-400/10 px-4 py-2 text-purple-400 hover:bg-purple-400/20"
            >
              <Plus className="h-4 w-4 mr-2 inline" />
              Upload Files
            </button>
          </div>
        </div>
      </div>
      {/* Files Content */}
      <div className="p-4 md:p-6 max-w-6xl mx-auto w-full">
        <div className="mt-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-white/20 bg-transparent p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500/20 flex items-center justify-center">
                  <FolderOpen className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">
                    {filesList.length}
                  </div>
                  <div className="text-sm text-white/60">Total Files</div>
                </div>
              </div>
            </div>

            <div className="border border-white/20 bg-transparent p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/20 flex items-center justify-center">
                  <Archive className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">
                    {formatFileSize(totalSize)}
                  </div>
                  <div className="text-sm text-white/60">Total Size</div>
                </div>
              </div>
            </div>
          </div>

          {/* Category Filter */}
          <div className="border border-white/20 bg-transparent p-6">
            <div className="flex items-center gap-2 mb-4">
              <FolderOpen className="h-5 w-5 text-purple-400" />
              <h3 className="text-lg font-medium text-white">
                File Categories
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category.key}
                  onClick={() => setSelectedCategory(category.key)}
                  className={`border px-3 py-1 text-xs ${
                    selectedCategory === category.key
                      ? "border-purple-400 bg-purple-400/10 text-purple-400"
                      : "border-white/20 text-white/60 hover:text-white"
                  }`}
                >
                  {category.label} ({category.count})
                </button>
              ))}
            </div>
          </div>

          {/* Upload Form */}
          {showUploadForm && (
            <div className="border border-white/20 bg-transparent p-6">
              <div className="flex items-center gap-2 mb-4">
                <Upload className="h-5 w-5 text-blue-400" />
                <h3 className="text-lg font-medium text-white">
                  Upload New File
                </h3>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="file-name">File Name</Label>
                    <Input
                      id="file-name"
                      type="text"
                      placeholder="e.g. Project Mockups"
                      value={newFile.name}
                      onChange={(e) =>
                        setNewFile({ ...newFile, name: e.target.value })
                      }
                      className="bg-transparent border-white/20 text-white rounded-none"
                    />
                  </div>
                  <div>
                    <Label htmlFor="file-category">Category</Label>
                    <Select
                      value={newFile.category}
                      onValueChange={(value) =>
                        setNewFile({
                          ...newFile,
                          category: value as
                            | "design"
                            | "document"
                            | "code"
                            | "image"
                            | "other",
                        })
                      }
                    >
                      <SelectTrigger className="bg-transparent border-white/20 text-white rounded-none">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent className="bg-black/80 backdrop-blur-md border-white/20 rounded-none">
                        <SelectItem value="document">Document</SelectItem>
                        <SelectItem value="design">Design</SelectItem>
                        <SelectItem value="code">Code</SelectItem>
                        <SelectItem value="image">Image</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="file-description">
                    Description (Optional)
                  </Label>
                  <Textarea
                    id="file-description"
                    placeholder="Brief description of the file..."
                    value={newFile.description}
                    onChange={(e) =>
                      setNewFile({ ...newFile, description: e.target.value })
                    }
                    className="bg-transparent border-white/20 text-white rounded-none"
                    rows={2}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-blue-400/30 bg-blue-400/10 px-4 py-2 text-blue-400 hover:bg-blue-400/20"
                  >
                    Choose File
                  </button>
                  <button
                    onClick={handleUploadSubmit}
                    className="border border-green-400/30 bg-green-400/10 px-4 py-2 text-green-400 hover:bg-green-400/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={
                      !fileInputRef.current?.files?.[0] || isUploadingFile
                    }
                  >
                    {isUploadingFile ? "Uploading..." : "Upload"}
                  </button>
                  <button
                    onClick={() => setShowUploadForm(false)}
                    className="border border-white/20 px-4 py-2 text-white/60 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Files List */}
          <div className="border border-white/20 bg-transparent p-6">
            <div className="flex items-center gap-2 mb-2">
              <FolderOpen className="h-5 w-5 text-purple-400" />
              <h3 className="text-lg font-medium text-white">Project Files</h3>
            </div>
            <p className="text-white/60 text-sm mb-6">
              All files related to this project
            </p>
            <div className="space-y-3">
              {filteredFiles.map((file: ProjectFile) => (
                <div
                  key={file.id}
                  className="border border-white/20 bg-transparent p-4"
                >
                  <FileOwnershipDisplay
                    file={file}
                    onDelete={handleDeleteFile}
                    isDeleting={isDeletingFile}
                  />
                </div>
              ))}
            </div>

            {filteredFiles.length === 0 && (
              <div className="text-center py-8 text-white/60">
                <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No files in this category. Upload your first file!</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Delete Confirmation Modal */}
      {showDeleteModal && fileToDeleteId && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="bg-black border border-red-400/30 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Trash2 className="h-5 w-5 text-red-400" />
                <h3 className="text-lg font-medium text-white">Delete File</h3>
              </div>
              <div className="space-y-3 mb-6">
                <p className="text-white/80">
                  Are you sure you want to delete this file?
                </p>
                {(() => {
                  const fileToDelete = filesList.find(
                    (f) => f.id === fileToDeleteId
                  );
                  return fileToDelete ? (
                    <div className="border border-red-400/20 bg-red-400/10 p-3">
                      <h4 className="text-white font-medium">
                        {fileToDelete.name}
                      </h4>
                      {fileToDelete.description && (
                        <p className="text-white/60 text-sm mt-1">
                          {fileToDelete.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
                        <span>{formatFileSize(fileToDelete.size)}</span>
                        <span className="px-2 py-1 border border-purple-400/30 text-xs text-purple-400">
                          {fileToDelete.category}
                        </span>
                        {fileToDelete.isSharedWithClient && (
                          <span className="text-green-400 text-xs">Shared</span>
                        )}
                      </div>
                    </div>
                  ) : null;
                })()}
                <p className="text-red-400 text-sm">
                  This action cannot be undone. The file will be permanently
                  deleted.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (fileToDeleteId) {
                      deleteFile(fileToDeleteId);
                      setFileToDeleteId(null);
                      setShowDeleteModal(false);
                    }
                  }}
                  className="border border-red-400/30 bg-red-400/10 px-4 py-2 text-red-400 hover:bg-red-400/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isDeletingFile}
                >
                  {isDeletingFile ? "Deleting..." : "Delete File"}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setFileToDeleteId(null);
                  }}
                  className="border border-white/20 px-4 py-2 text-white/60 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </WorkspaceLayout>
  );
}

// Wrap with page access control
export default withPageAccess(FilesPage, "files");

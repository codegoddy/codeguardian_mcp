/** @format */

"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useSettingsBundle, useUpdateProfile, useChangePassword } from "@/hooks/useSettings";
import { toast } from "@/lib/toast";
import LinkedIdentities from "@/components/auth/LinkedIdentities";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { Checkbox } from "@/components/ui";
import LoadingSpinner from "@/components/LoadingSpinner";
import AuthGuard from "@/components/AuthGuard";
import ConfirmationModal from "@/components/ui/ConfirmationModal";

export default function SettingsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use the TanStack Query bundle for all settings operations
  const {
    settings,
    isLoading,
    updateSettings,
    uploadImage,
    deleteImage,
    isUpdating,
    isUploading,
    isDeleting,
  } = useSettingsBundle();

  // Use profile and password hooks (profile data now comes from settings)
  const updateProfileMutation = useUpdateProfile();
  const changePasswordMutation = useChangePassword();

  const [isDeleteImageModalOpen, setIsDeleteImageModalOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    full_name: "",
    bio: "",
    default_currency: "USD",
    timezone: "UTC",
    date_format: "YYYY-MM-DD",
    time_format: "24h",
    email_notifications: true,
    auto_pause_notifications: true,
    contract_signed_notifications: true,
    payment_received_notifications: true,
  });

  // Password change state
  const [passwordData, setPasswordData] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  const isChangingPassword = changePasswordMutation.isPending;

  // Update form data when settings are loaded (profile data is now included)
  useEffect(() => {
    if (settings) {
      setFormData({
        full_name: settings.full_name || "",
        bio: settings.bio || "",
        default_currency: settings.default_currency,
        timezone: settings.timezone,
        date_format: settings.date_format,
        time_format: settings.time_format,
        email_notifications: settings.email_notifications,
        auto_pause_notifications: settings.auto_pause_notifications,
        contract_signed_notifications: settings.contract_signed_notifications,
        payment_received_notifications: settings.payment_received_notifications,
      });
    }
  }, [settings]);

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value, type } = e.target;

    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Update profile name if changed
      if (formData.full_name && formData.full_name !== settings?.full_name) {
        await updateProfileMutation.mutateAsync({ full_name: formData.full_name });
      }

      // Update settings (exclude full_name as it's handled separately)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { full_name, ...settingsData } = formData;
      await updateSettings(settingsData);
      
      toast.success("Settings saved successfully");
    } catch (error) {
      toast.error("Failed to save settings");
      console.error("Error saving settings:", error);
    }
  };

  const handleChangePassword = async () => {
    // Validate passwords match
    if (passwordData.new_password !== passwordData.confirm_password) {
      toast.error("New passwords do not match");
      return;
    }

    // Validate password length
    if (passwordData.new_password.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return;
    }

    try {
      await changePasswordMutation.mutateAsync({
        current_password: passwordData.current_password,
        new_password: passwordData.new_password,
      });
      
      toast.success("Password changed successfully");

      // Clear password fields
      setPasswordData({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to change password";
      toast.error(errorMessage);
      console.error("Error changing password:", error);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must be less than 5MB");
      return;
    }

    try {
      await uploadImage(file);
      toast.success("Profile image uploaded successfully");
    } catch (error) {
      toast.error("Failed to upload image");
      console.error("Error uploading image:", error);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteImage = async () => {
    try {
      await deleteImage();
      toast.success("Profile image deleted successfully");
      setIsDeleteImageModalOpen(false);
    } catch (error) {
      toast.error("Failed to delete image");
      console.error("Error deleting image:", error);
    }
  };

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <LoadingSpinner size="lg" color="black" />
          <span className="ml-3 text-gray-400">Loading settings...</span>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen py-8" style={{ backgroundColor: "#F5F5F5" }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-normal text-black">Settings</h1>
          <p className="mt-2 text-gray-600">
            Manage your profile and preferences
          </p>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* Profile Section */}
          <div className="bg-white rounded-2xl p-6" style={{ outline: "none", border: "none" }}>
            <h2 className="text-xl font-normal text-black">
              Profile
            </h2>

            {/* Profile Image */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Profile Image
              </label>
              <div className="flex items-center space-x-4">
                <div className="relative">
                  {settings?.profile_image_url ? (
                    <Image
                      src={settings.profile_image_url}
                      alt="Profile"
                      width={96}
                      height={96}
                      className="w-24 h-24 rounded-full object-cover"
                      style={{ border: '1px solid #171717' }}
                      priority
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center" style={{ border: '1px solid #171717' }}>
                      <span className="text-gray-400 text-2xl">👤</span>
                    </div>
                  )}
                  {(isUploading || isDeleting) && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
                      <LoadingSpinner size="md" color="white" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || isDeleting}
                      className="px-4 py-2 bg-[#ccff00] text-black hover:bg-[#ccff00] disabled:opacity-50 rounded-lg"
                      style={{ border: '1px solid #171717', boxShadow: '2px 2px 0px #171717' }}
                    >
                      {isUploading ? 'Uploading...' : 'Upload Image'}
                    </button>
                    {settings?.profile_image_url && (
                      <button
                        type="button"
                        onClick={() => setIsDeleteImageModalOpen(true)}
                        disabled={isUploading || isDeleting}
                        className="px-4 py-2 bg-[#ccff00] text-black hover:bg-[#ccff00] disabled:opacity-50 rounded-lg"
                        style={{ border: '1px solid #171717', boxShadow: '2px 2px 0px #171717' }}
                      >
                        Delete Image
                      </button>
                    )}
                  </div>
                </div>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Recommended: Square image, at least 200x200px, max 5MB
            </p>
          </div>

          {/* Full Name */}
          <div>
            <label
              htmlFor="full_name"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Full Name
            </label>
            <input
              type="text"
              id="full_name"
              name="full_name"
              autoComplete="name"
              value={formData.full_name || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-transparent"
              style={{ border: '1px solid #171717', boxShadow: '2px 2px 0px #171717' }}
              placeholder="Enter your full name"
            />
          </div>

          {/* Bio */}
          <div className="mt-6">
            <label
              htmlFor="bio"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Bio
            </label>
            <textarea
              id="bio"
              name="bio"
              value={formData.bio}
              onChange={handleInputChange}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-transparent"
              style={{ border: '1px solid #171717', boxShadow: '2px 2px 0px #171717' }}
              placeholder="Tell us about yourself..."
            />
          </div>
        </div>

        {/* Preferences Section */}
        <div className="bg-white rounded-2xl p-6" style={{ outline: "none", border: "none" }}>
          <h2 className="text-xl font-normal text-black">
            Preferences
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Currency */}
            <div>
              <label
                htmlFor="default_currency"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Default Currency
              </label>
              <Select
                value={formData.default_currency}
                onValueChange={(value) => handleSelectChange("default_currency", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="GBP">GBP - British Pound</SelectItem>
                  <SelectItem value="KES">KES - Kenyan Shilling</SelectItem>
                  <SelectItem value="NGN">NGN - Nigerian Naira</SelectItem>
                  <SelectItem value="ZAR">ZAR - South African Rand</SelectItem>
                  <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                  <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
                  <SelectItem value="INR">INR - Indian Rupee</SelectItem>
                  <SelectItem value="JPY">JPY - Japanese Yen</SelectItem>
                  <SelectItem value="CNY">CNY - Chinese Yuan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Timezone */}
            <div>
              <label
                htmlFor="timezone"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Timezone
              </label>
              <Select
                value={formData.timezone}
                onValueChange={(value) => handleSelectChange("timezone", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTC">UTC</SelectItem>
                  <SelectItem value="America/New_York">Eastern Time (US)</SelectItem>
                  <SelectItem value="America/Chicago">Central Time (US)</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time (US)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time (US)</SelectItem>
                  <SelectItem value="Europe/London">London</SelectItem>
                  <SelectItem value="Europe/Paris">Paris</SelectItem>
                  <SelectItem value="Africa/Nairobi">Nairobi</SelectItem>
                  <SelectItem value="Africa/Lagos">Lagos</SelectItem>
                  <SelectItem value="Asia/Dubai">Dubai</SelectItem>
                  <SelectItem value="Asia/Kolkata">India</SelectItem>
                  <SelectItem value="Asia/Singapore">Singapore</SelectItem>
                  <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                  <SelectItem value="Australia/Sydney">Sydney</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Format */}
            <div>
              <label
                htmlFor="date_format"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Date Format
              </label>
              <Select
                value={formData.date_format}
                onValueChange={(value) => handleSelectChange("date_format", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select date format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (2025-01-15)</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (01/15/2025)</SelectItem>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (15/01/2025)</SelectItem>
                  <SelectItem value="DD-MM-YYYY">DD-MM-YYYY (15-01-2025)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Time Format */}
            <div>
              <label
                htmlFor="time_format"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Time Format
              </label>
              <Select
                value={formData.time_format}
                onValueChange={(value) => handleSelectChange("time_format", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select time format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">24-hour (14:30)</SelectItem>
                  <SelectItem value="12h">12-hour (2:30 PM)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Notification Preferences Section */}
        <div className="bg-white rounded-2xl p-6" style={{ outline: "none", border: "none" }}>
          <h2 className="text-xl font-normal text-black mb-4">
            Notification Preferences
          </h2>

          <div className="space-y-4">
            <Checkbox
              id="email_notifications"
              name="email_notifications"
              checked={formData.email_notifications}
              onChange={handleInputChange}
              label="Email notifications"
            />

            <Checkbox
              id="auto_pause_notifications"
              name="auto_pause_notifications"
              checked={formData.auto_pause_notifications}
              onChange={handleInputChange}
              label="Auto-pause alerts (budget warnings)"
            />

            <Checkbox
              id="contract_signed_notifications"
              name="contract_signed_notifications"
              checked={formData.contract_signed_notifications}
              onChange={handleInputChange}
              label="Contract signed notifications"
            />

            <Checkbox
              id="payment_received_notifications"
              name="payment_received_notifications"
              checked={formData.payment_received_notifications}
              onChange={handleInputChange}
              label="Payment received notifications"
            />
          </div>
        </div>

        {/* Linked Accounts / Identity Linking Section */}
        <div className="bg-white rounded-2xl p-6" style={{ outline: "none", border: "none" }}>
          <h2 className="text-xl font-normal text-black mb-4">
            Linked Accounts
          </h2>
          <LinkedIdentities onIdentityChange={() => {
            // Refresh settings when identities change
            // This ensures the "can_change_password" status is updated
          }} />
        </div>

        {/* Security Section */}
        <div className="bg-white rounded-2xl p-6" style={{ outline: "none", border: "none" }}>
          <h2 className="text-xl font-normal text-black mb-4">
            Security
          </h2>

          {settings?.can_change_password ? (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="current_password"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Current Password
                </label>
                <input
                  type="password"
                  id="current_password"
                  name="current_password"
                  autoComplete="current-password"
                  value={passwordData.current_password}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, current_password: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-transparent"
                  style={{ border: '1px solid #171717', boxShadow: '2px 2px 0px #171717' }}
                  placeholder="Enter current password"
                />
              </div>

              <div>
                <label
                  htmlFor="new_password"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  New Password
                </label>
                <input
                  type="password"
                  id="new_password"
                  name="new_password"
                  autoComplete="new-password"
                  value={passwordData.new_password}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, new_password: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-transparent"
                  style={{ border: '1px solid #171717', boxShadow: '2px 2px 0px #171717' }}
                  placeholder="Enter new password (min 8 characters)"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Password must be at least 8 characters long
                </p>
              </div>

              <div>
                <label
                  htmlFor="confirm_password"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Confirm New Password
                </label>
                <input
                  type="password"
                  id="confirm_password"
                  name="confirm_password"
                  autoComplete="new-password"
                  value={passwordData.confirm_password}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, confirm_password: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-transparent"
                  style={{ border: '1px solid #171717', boxShadow: '2px 2px 0px #171717' }}
                  placeholder="Confirm new password"
                />
              </div>

              <button
                type="button"
                onClick={handleChangePassword}
                disabled={isChangingPassword || !passwordData.current_password || !passwordData.new_password || !passwordData.confirm_password}
                className="px-4 py-2 bg-[#ccff00] text-black hover:bg-[#ccff00] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
                style={{ border: '1px solid #171717', boxShadow: '2px 2px 0px #171717' }}
              >
                {isChangingPassword ? "Changing Password..." : "Change Password"}
              </button>
            </div>
          ) : (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                {settings?.is_oauth_user 
                  ? `You signed in with ${settings.provider}. Password changes are managed through your ${settings.provider} account.`
                  : "Password management is not available for your account type."}
              </p>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isUpdating}
            className="px-6 py-3 bg-[#ccff00] text-black hover:bg-[#ccff00] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
            style={{ border: '1px solid #171717', boxShadow: '2px 2px 0px #171717' }}
          >
            {isUpdating ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>
      </div>
    </div>

    {/* Delete Image Confirmation Modal */}
    <ConfirmationModal
      isOpen={isDeleteImageModalOpen}
      onClose={() => setIsDeleteImageModalOpen(false)}
      onConfirm={handleDeleteImage}
      title="Delete Profile Image"
      description="Are you sure you want to delete your profile image? This action cannot be undone."
      confirmText="Delete"
      cancelText="Cancel"
      variant="danger"
      isLoading={isDeleting}
    />
    </AuthGuard>
  );
}

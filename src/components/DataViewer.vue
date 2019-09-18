<template>
  <v-expansion-panel>
    <v-expansion-panel-header :disable-icon-rotate="isDoneDownload || hasError">
      <span>View #{{ props.viewNo }}</span>
      <!-- Percentage -->
      {{ progressPercentage ? `${progressPercentage.toFixed(2)} %` : "" }}
      <template v-slot:actions>
        <v-icon :color="headerIconColor" style="margin-left: 0.3em">
          {{ headerIcon}}
        </v-icon>
      </template>
    </v-expansion-panel-header>
    <v-expansion-panel-content>
      <!-- loaded of total -->
      <div style="text-align: center">
        {{ readableBytesString(progressSetting.loadedBytes, 1) }}{{ !progressSetting.totalBytes ? "" : ` of ${readableBytesString(progressSetting.totalBytes, 1)}` }}
      </div>

      <!-- Progress bar -->
      <v-progress-linear :value="progressPercentage"
                         :indeterminate="progressPercentage === null && !canceled && errorMessage === ''" />

      <v-simple-table class="text-left">
        <tbody>
        <tr class="text-left">
          <td>Download URL</td>
          <td>{{ downloadPath }}</td>
        </tr>
        </tbody>
      </v-simple-table>

      <!-- Image viewer -->
      <div v-show="imgSrc !== ''" style="text-align: center">
        <img :src="imgSrc"
             style="width: 95%">
      </div>

      <!-- Video viewer -->
      <div v-if="videoSrc !== ''" style="text-align: center">
        <video :src="videoSrc"
               style="width: 95%"
               controls />
      </div>

      <!-- Text viewer -->
      <!-- NOTE: Don't use v-if because the inner uses "ref" and the ref is loaded in mounted()-->
      <div v-show="text !== ''" style="text-align: center">
        <div style="text-align: right">
          <v-btn ref="text_copy_button" style="background-color: #dcdcdc; margin-bottom: 0.3em;">
            <!-- (from: https://iconify.design/icon-sets/octicon/clippy.html) -->
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" focusable="false" width="1.5em" height="1.5em" style="-ms-transform: rotate(360deg); -webkit-transform: rotate(360deg); transform: rotate(360deg);" preserveAspectRatio="xMidYMid meet" viewBox="0 0 14 16"><path fill-rule="evenodd" d="M2 13h4v1H2v-1zm5-6H2v1h5V7zm2 3V8l-3 3 3 3v-2h5v-2H9zM4.5 9H2v1h2.5V9zM2 12h2.5v-1H2v1zm9 1h1v2c-.02.28-.11.52-.3.7-.19.18-.42.28-.7.3H1c-.55 0-1-.45-1-1V4c0-.55.45-1 1-1h3c0-1.11.89-2 2-2 1.11 0 2 .89 2 2h3c.55 0 1 .45 1 1v5h-1V6H1v9h10v-2zM2 5h8c0-.55-.45-1-1-1H8c-.55 0-1-.45-1-1s-.45-1-1-1-1 .45-1 1-.45 1-1 1H3c-.55 0-1 .45-1 1z" fill="#000000"/></svg>
          </v-btn>
        </div>
        <pre v-html="linkifiedText"
             class="text-view"
             ref="text_viewer"/>
      </div>

      <div v-if="isCancelable" style="text-align: right">
        <!-- Cancel button -->
        <v-btn color="warning"
               outlined
               class="ma-2 justify-end"
               @click="cancelDownload()">
          <v-icon >cancel</v-icon>
          Cancel
        </v-btn>
      </div>

      <!-- Save button -->
      <v-btn v-if="isDoneDownload"
             color="primary"
             block
             @click="save()"
             style="margin-top: 1em;">
        <v-icon >save</v-icon>
        Save
      </v-btn>

      <v-alert type="error"
               outlined
               :value="errorMessage !== ''">
        {{ errorMessage }}
      </v-alert>

    </v-expansion-panel-content>
  </v-expansion-panel>

</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import urlJoin from 'url-join';
import * as utils from '@/utils';
import linkifyHtml from 'linkifyjs/html';
import Clipboard from 'clipboard';
import * as FileSaver from 'file-saver';

export type DataViewerProps = {
  viewNo: number,
  serverUrl: string,
  secretPath: string
};

// NOTE: Automatically download when mounted
@Component
export default class DataViewer extends Vue {
  @Prop() private props!: DataViewerProps;

  // Progress bar setting
  private progressSetting: {loadedBytes: number, totalBytes?: number} = {
    loadedBytes: 0,
    totalBytes: undefined,
  };

  private readableBytesString = utils.readableBytesString;

  private errorMessage: string = "";
  private xhr: XMLHttpRequest;
  private isDoneDownload: boolean = false;
  private canceled: boolean = false;
  private imgSrc: string = '';
  private videoSrc: string = '';
  private text: string = '';

  private blob: Blob = new Blob();

  private get progressPercentage(): number | null {
    if (this.isDoneDownload) {
      return 100;
    } else if (this.progressSetting.totalBytes === undefined) {
      return null;
    } else if (this.progressSetting.totalBytes === 0) {
      return 100;
    } else {
      return this.progressSetting.loadedBytes / this.progressSetting.totalBytes * 100;
    }
  }

  private get hasError(): boolean {
    return this.errorMessage !== "";
  }

  private get headerIcon(): string {
    if (this.hasError) {
      return "mdi-alert";
    } else if (this.canceled) {
      return "cancel";
    } else if (this.isDoneDownload) {
      return "mdi-check";
    } else {
      return "keyboard_arrow_down";
    }
  }

  private get headerIconColor(): string | undefined {
    if (this.hasError) {
      return "error";
    } else if (this.canceled) {
      return "warning";
    } else if (this.isDoneDownload) {
      return "teal";
    } else {
      return undefined
    }
  }

  private get isCancelable(): boolean {
    return !this.isDoneDownload && !this.hasError && !this.canceled;
  }

  private get downloadPath(): string {
    return urlJoin(this.props.serverUrl, this.props.secretPath);
  }

  private get linkifiedText(): string {
    return linkifyHtml(this.text, {
      defaultProtocol: 'https'
    });
  }

  constructor() {
    super();
    this.xhr = new XMLHttpRequest();
  }

  mounted() {
    // Setting for copying to clipboard
    new Clipboard((this.$refs.text_copy_button as Vue).$el, {
      target: () => this.$refs.text_viewer as Element
    });

    this.xhr.open('GET', this.downloadPath);
    this.xhr.responseType = 'blob';
    this.xhr.onprogress = (ev) => {
      console.log(`Download: ${ev.loaded}`)
    };
    this.xhr.onreadystatechange = (ev) => {
      if (this.xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
        const length: string | null = this.xhr.getResponseHeader('Content-Length');
        if (length !== null) {
          this.progressSetting.totalBytes = parseInt(length, 10);
        }
      }
    };
    this.xhr.onprogress = (ev) => {
      this.progressSetting.loadedBytes = ev.loaded;
    };
    this.xhr.onload = (ev) => {
      if (this.xhr.status === 200) {
        this.isDoneDownload = true;
        this.blob = this.xhr.response;
        // View blob if possible
        this.viewBlob();
      } else {
        this.errorMessage = `Error (${this.xhr.status}): "${this.xhr.responseText}"`;
      }
    };
    this.xhr.onerror = () => {
      this.errorMessage = "Download error";
    };
    this.xhr.send();
  }

  private viewBlob() {
    const blobUrl = URL.createObjectURL(this.blob);
    if (this.blob.type.startsWith("image/")) {
      this.imgSrc = blobUrl;
    } else if (this.blob.type.startsWith("video/")) {
      this.videoSrc = blobUrl;
    } else if (this.blob.type.startsWith("text/")) {
      const reader = new FileReader();
      reader.readAsText(this.blob);
      reader.onload = () => {
        // Get text
        this.text = reader.result as string;
      }
    }
  }

  private cancelDownload(): void {
    this.xhr.abort();
    this.canceled = true;
  }

  private save(): void {
    FileSaver.saveAs(this.blob, this.props.secretPath);
  }
}
</script>

<style scoped>
.text-view {
  border: 1px solid #ccc;
  text-align: left;
  padding: 0.5em;
  max-height: 15em;
  min-height: 4em;
  overflow-y: scroll;
  border-radius: 5px;
}
</style>